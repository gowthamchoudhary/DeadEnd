/**
 * Run side panel (webview view), per Part 3 + Part 4:
 *   - task text, detected agents (from deadend-runner), agent picker,
 *     project name (git repo name default), Run button, baseline
 *     "run without DeadEnd" checkbox
 *   - spawn the runner in the workspace folder; stream output to the
 *     DeadEnd output channel; follow the backend's run event SSE stream
 *     and show live events in the panel
 *   - Cancel kills the runner process; the run is marked on the backend
 *     as failure ("cancelled") via /runs/{id}/finish
 *   - Results tab: files changed (open native diff), tests ok, tokens,
 *     duration; Accept keeps changes, Reject reverts touched files via
 *     git checkout after confirmation
 *   - On accept of a verified fix: "Share with team?" then "Publish to
 *     global?" showing the /promote redaction diff in a webview for
 *     explicit approval before anything is published
 */
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AgentInfo, detectAgents, runnerMissing, runnerPath } from "./agents";
import { DeadEndApi, RunEventMsg } from "./api";
import { AuthController, msg } from "./auth";
import { DeadEndStore } from "./secrets";
import { getOrCreateOutputChannel } from "./commands";

interface RunState {
  runId?: string;
  baseline?: boolean;
  proc?: cp.ChildProcess;
  active: boolean;
  cancelled?: boolean;
}

const PHASE_LABELS: Record<string, string> = {
  retrieve: "retrieved context",
  attempt: "agent working",
  "attempt-done": "attempt done",
  test: "running tests",
  verify: "verifying",
  record: "recording",
};

export class RunPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly VIEW_ID = "deadend.runPanel";
  private view?: vscode.WebviewView;
  private state: RunState = { active: false };
  private agents: AgentInfo[] = [];
  private stopSse?: () => void;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext,
              private api: DeadEndApi,
              private store: DeadEndStore,
              private auth: AuthController) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
    void this.pushAgents();
  }

  // ------------------------------------------------------------------ state
  private post(op: string, data?: unknown): void {
    void this.view?.webview.postMessage({ op, ...(data ?? {}) });
  }

  private workspaceDir(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private gitRepoName(dir: string): string {
    const head = path.join(dir, ".git");
    try {
      if (fs.existsSync(head)) {
        const cfg = fs.readFileSync(path.join(dir, ".git", "config"), "utf8");
        const m = /url\s*=\s*.*[/:](.+?)(?:\.git)?\s*$/m.exec(cfg);
        if (m) {
          return m[1];
        }
      }
    } catch {
      // ignore; fall through
    }
    return path.basename(dir);
  }

  private async pushAgents(): Promise<void> {
    const dir = this.workspaceDir();
    this.agents = await detectAgents(dir);
    this.post("agents", { agents: this.agents, runnerMissing: this.agents.length === 0 });
  }

  private async onMessage(m: { op: string; [k: string]: unknown }): Promise<void> {
    switch (m.op) {
      case "refreshAgents":
        await this.pushAgents();
        break;
      case "run":
        await this.startRun(String(m.task ?? ""), String(m.agent ?? "claude-code"),
          !!m.baseline);
        break;
      case "cancel":
        this.cancel();
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------- run
  private async startRun(task: string, agent: string, baseline: boolean): Promise<void> {
    const dir = this.workspaceDir();
    if (!dir) {
      void vscode.window.showErrorMessage("Open a workspace folder first.");
      return;
    }
    const token = await this.store.getToken();
    const teamId = await this.store.getTeam();
    if (!token) {
      void vscode.window.showWarningMessage("Sign in first (DeadEnd: Sign in).");
      return;
    }
    if (!baseline && !teamId) {
      void vscode.window.showWarningMessage("Pick a team first (DeadEnd: Choose team).");
      return;
    }

    this.state = { active: true, baseline, cancelled: false };
    this.post("runStarted", { baseline });
    const ch = getOrCreateOutputChannel();
    ch.show(true);
    ch.appendLine(`=== DeadEnd run (${agent}${baseline ? ", baseline (no DeadEnd context)" : ""}) ===`);

    let runId: string | undefined;
    let streamAbort: (() => void) | undefined;
    try {
      if (!baseline) {
        // 1) create the run record, 2) follow its SSE stream for live events
        const created = await this.api.createRun({
          team_id: teamId!, task, repo_url: dir, agent,
        });
        runId = created.run_id;
        this.state.runId = runId;
        this.post("runId", { runId });
        this.api.runStream(runId,
          (ev: RunEventMsg) => this.post("event", { ev }),
          (status) => {
            this.state.active = false;
            this.post("done", { status });
          },
          (fn) => { streamAbort = fn; }, token);
      }

      // 3) spawn the runner as a child process in the workspace folder
      const runner = runnerPath();
      const args = baseline
        ? ["run", dir, task, "--agent", agent, "--no-deadend"]
        : ["run", dir, task, "--agent", agent];
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        DEADEND_BACKEND: vscode.workspace.getConfiguration().get<string>("deadend.backendUrl",
          "https://deadend-4wyx.onrender.com"),
        DEADEND_TOKEN: token,
        ...(baseline ? {} : { DEADEND_TEAM: teamId! }),
      };
      const proc = cp.spawn(runner, args, { cwd: dir, env });
      this.state.proc = proc;
      proc.stdout?.on("data", (d: Buffer) => ch.append(d.toString()));
      proc.stderr?.on("data", (d: Buffer) => ch.append(d.toString()));
      proc.on("error", (err) => {
        if (runnerMissing(err)) {
          this.post("runnerMissing");
          void vscode.window.showErrorMessage(
            "deadend-runner not found. Install it (DeadEnd: Install runner).",
            "Install runner").then((pick) => {
              if (pick === "Install runner") {
                void vscode.commands.executeCommand("deadend.installRunner");
              }
            });
        } else {
          ch.appendLine(`runner error: ${msg(err)}`);
        }
        this.finish("failure");
      });
      proc.on("close", (code) => {
        ch.appendLine(`runner exited (${code})`);
        this.finish(code === 0 ? "success" : this.state.cancelled ? "failure" : "failure");
      });
    } catch (ex) {
      ch.appendLine(`run failed: ${msg(ex)}`);
      this.finish("failure");
      void vscode.window.showErrorMessage(`DeadEnd run failed: ${msg(ex)}`);
    }
    this.stopSse = streamAbort;
  }

  private finish(status: string): void {
    this.state.active = false;
    this.post("done", { status });
  }

  cancel(): void {
    if (this.state.proc && this.state.active) {
      this.state.cancelled = true;
      this.state.proc.kill("SIGTERM");
      setTimeout(() => {
        if (this.state.proc && this.state.active) {
          this.state.proc.kill("SIGKILL");
        }
      }, 3000);
      const rid = this.state.runId;
      if (rid) {
        const token = this.api;
        void this.store.getToken().then((tok) => {
          if (tok) {
            // mark the run cancelled on the backend (failure status)
            void token.finishRun(rid, "failure").catch(() => undefined);
          }
        });
      }
      this.post("cancelled");
    }
  }

  // ---------------------------------------------------------------- dispose
  dispose(): void {
    this.stopSse?.();
    this.disposables.forEach((d) => d.dispose());
  }

  // ------------------------------------------------------------------- HTML
  private html(): string {
    const nonce = Math.random().toString(16).slice(2);
    return /* html */ `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/>
<style>
  body { font-family: var(--vscode-font-family); padding: 8px 12px; }
  input, select, textarea { width: 100%; box-sizing: border-box; margin: 4px 0 10px; }
  textarea { min-height: 80px; }
  button.accent { background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: 0; padding: 6px 14px; cursor: pointer; }
  button.sub { background: transparent; color: var(--vscode-button-secondaryForeground || #ccc);
    border: 1px solid var(--vscode-panel-border || #555); padding: 4px 10px; cursor: pointer; }
  .row { margin-bottom: 4px; }
  #events { font-size: 0.85em; color: var(--vscode-descriptionForeground); max-height: 140px; overflow: auto; }
  .missing { color: var(--vscode-errorForeground); }
  h4 { margin: 12px 0 4px; }
</style></head>
<body>
  <div class="row">Team: <code id="team">(none)</code> <button class="sub" id="pickTeam">change</button></div>
  <label>Task</label>
  <textarea id="task" placeholder="Describe the bug or task…"></textarea>
  <label>Agent</label>
  <div><select id="agent"></select>
       <button class="sub" id="refreshAgents">refresh</button></div>
  <div id="agentList" class="row"></div>
  <label>Project</label>
  <input id="project" readonly />
  <label><input type="checkbox" id="baseline"/> Run without DeadEnd (baseline)</label>
  <div>
    <button class="accent" id="runBtn">Run</button>
    <button class="sub" id="cancelBtn" disabled>Cancel</button>
  </div>
  <h4>Run events</h4>
  <div id="events">(idle)</div>
  <h4>Result</h4>
  <div id="result">(no run yet)</div>
  <div id="actions"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const el = (id) => document.getElementById(id);
    el("runBtn").onclick = () => vscode.postMessage({ op: "run",
      task: el("task").value, agent: el("agent").value, baseline: el("baseline").checked });
    el("cancelBtn").onclick = () => vscode.postMessage({ op: "cancel" });
    el("refreshAgents").onclick = () => vscode.postMessage({ op: "refreshAgents" });
    el("pickTeam").onclick = () => vscode.commands.executeCommand("deadend.chooseTeam");
    addEventListener("message", (e) => {
      const m = e.data;
      if (m.op === "agents") {
        const sel = el("agent"); sel.innerHTML = "";
        (m.agents || []).filter(a => a.detected).forEach(a => {
          const o = document.createElement("option");
          o.value = a.agent; o.textContent = a.agent +
            (a.tokens_reported === "not_reported" ? " (no tokens)" : "");
          sel.appendChild(o);
        });
        el("agentList").innerHTML = (m.agents || []).map(a =>
          '<div class="' + (a.detected ? "" : "missing") + '">' +
          (a.detected ? "\\u2714" : "\\u2718") + " " + a.agent +
          " \\u00b7 tokens: " + (a.tokens_reported || "?") + "</div>").join("") ||
          '<div class="missing">Runner missing \u2014 use "DeadEnd: Install runner"</div>';
      } else if (m.op === "runStarted") {
        el("runBtn").disabled = true; el("cancelBtn").disabled = false;
        el("events").textContent = "starting…"; el("result").textContent = "running…";
      } else if (m.op === "runId") {
        el("events").innerHTML += '<div>run ' + m.runId.slice(0, 8) + "…</div>";
      } else if (m.op === "event") {
        const ev = m.ev;
        el("events").innerHTML += "<div>#" + ev.seq + " " +
          (ev.payload && ev.payload.ok !== undefined ? (ev.payload.ok ? "\\u2714 test" : "\\u2718 test")
            : (ev.phase in ${JSON.stringify(PHASE_LABELS)} ? ${JSON.stringify(PHASE_LABELS)}[ev.phase] : ev.phase)) +
          "</div>";
      } else if (m.op === "done" || m.op === "cancelled") {
        el("runBtn").disabled = false; el("cancelBtn").disabled = true;
        el("result").textContent = m.op === "cancelled" ? "cancelled"
          : ("status: " + m.status);
      } else if (m.op === "runnerMissing") {
        el("agentList").innerHTML =
          '<div class="missing">deadend-runner not found \u2014 install it to run tasks</div>';
      } else if (m.op === "state") {
        if (m.team !== undefined) { el("team").textContent = m.team || "(none)"; }
        if (m.project) { el("project").value = m.project; }
      } else if (m.op === "result") {
        el("result").innerHTML = m.html;
        el("actions").innerHTML = m.actions;
        (m.buttons || []).forEach(b => {
          const btn = document.createElement("button");
          btn.textContent = b.label; btn.className = b.kind || "sub";
          btn.onclick = () => vscode.postMessage({ op: b.op });
          el("actions").appendChild(btn);
        });
      }
    });
    vscode.postMessage({ op: "requestState" });
  </script>
</body></html>`;
  }
}

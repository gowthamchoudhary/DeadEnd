/**
 * Run side panel (webview view) — full product UI.
 *
 *   Part 1: setup checklist first (live statuses, re-check on focus/refresh)
 *   Part 2: run controls — agent picker (detected only), memory toggle
 *           (off = baseline), scope selector (private/team/global),
 *           redaction count from real scanner output, preview context
 *   Part 3: live timeline driven ONLY by the runner's DEADEND_EVENT
 *           JSON lines (each phase card animates in; footer counters
 *           come from the done event or show "not reported")
 *   Part 4: result card, Accept/Reject, save-as-memory with scope +
 *           redaction preview; global promote requires explicit Approve
 *
 * Non-negotiable: every number/status here comes from a real event, an
 * API response or a command exit code. Unknown -> "not reported".
 */
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { AgentInfo, detectAgents, runnerPath } from "./agents";
import { DeadEndApi, RetrieveResult, RunEventMsg } from "./api";
import { AuthController, msg } from "./auth";
import { DeadEndStore } from "./secrets";
import { getOrCreateOutputChannel } from "./commands";
import { CheckItem, SetupChecker, loginHint } from "./setup";
import { WEBVIEW_CSS, codiconLink } from "./webviewTheme";

interface RunState {
  runId?: string;
  baseline?: boolean;
  proc?: cp.ChildProcess;
  active: boolean;
  cancelled?: boolean;
  phaseEvents: RunEventMsg[];
  matchStats?: Array<{ entry_id?: string; score?: number | null;
    observations?: number | null; verified?: boolean; scope?: string }>;
  packTokensEst?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  durationS?: number | null;
  testCounts?: { passed: number | null; failed: number | null;
                 errors: number | null; total: number | null };
  redactions?: number;
  finished?: string;
}

export class RunPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly VIEW_ID = "deadend.runPanel";
  private view?: vscode.WebviewView;
  private state: RunState = { active: false, phaseEvents: [] };
  private agents: AgentInfo[] = [];
  private setup?: SetupChecker;
  private checks: CheckItem[] = [];
  private disposables: vscode.Disposable[] = [];
  private killInjection = false;

  constructor(private context: vscode.ExtensionContext,
              private api: DeadEndApi,
              private store: DeadEndStore,
              private auth: AuthController) {
    this.setup = new SetupChecker(api, store);
    // re-run the cheap checks when the window gains focus
    this.disposables.push(vscode.window.onDidChangeWindowState((e) => {
      if (e.focused && this.view?.visible) {
        void this.refreshChecks(false);
      }
    }));
    this.disposables.push(vscode.commands.registerCommand("deadend.refreshSetup", () => {
      void this.refreshChecks(true);
    }));
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage((m) => void this.onMessage(m));
    void this.refreshChecks(false);
  }

  // ------------------------------------------------------------------ state
  private post(op: string, data?: Record<string, unknown>): void {
    void this.view?.webview.postMessage({ op, ...(data ?? {}) });
  }

  private workspaceDir(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  }

  private gitProjectName(dir: string): string {
    const head = path.join(dir, ".git");
    try {
      if (fs.existsSync(head)) {
        const cfg = fs.readFileSync(path.join(dir, ".git", "config"), "utf8");
        const m = /url\s*=.*[/:](.+?)(?:\.git)?\s*$/m.exec(cfg);
        if (m) {
          return m[1];
        }
      }
    } catch {
      // fall through to folder name
    }
    return path.basename(dir);
  }

  // ----------------------------------------------------------- setup checks
  private async refreshChecks(recheckBackend: boolean): Promise<void> {
    this.checks = await this.setup!.check(this.workspaceDir(), recheckBackend);
    const signedIn = this.checks.find((c) => c.id === "signin")?.status === "ok";
    this.post("checks", {
      checks: this.checks, signedIn,
      loginHints: this.setup!.agents.filter((a) => a.detected)
        .map((a) => ({ agent: a.agent, hint: loginHint(a.agent) })),
      killInjection: this.killInjection,
    });
  }

  private requiredGreen(): string | undefined {
    const st = (id: string) => this.checks.find((c) => c.id === id)?.status;
    if (st("signin") !== "ok") { return "Sign in first."; }
    if (st("team") !== "ok") { return "Choose a team."; }
    if (st("runner") !== "ok") { return "Install the runner."; }
    if (st("agents") !== "ok") { return "No agent CLI detected on this machine."; }
    return undefined;
  }

  // -------------------------------------------------------------- messages
  private async onMessage(m: { op: string; [k: string]: unknown }): Promise<void> {
    switch (m.op) {
      case "requestInit":
        await this.refreshChecks(false);
        break;
      case "refreshChecks":
        await this.refreshChecks(true);
        break;
      case "action":
        await this.doCheckAction(String(m.id ?? ""));
        break;
      case "toggleKill":
        this.killInjection = !!m.value;
        this.post("checks", { checks: this.checks,
          signedIn: this.checks.find((c) => c.id === "signin")?.status === "ok",
          killInjection: this.killInjection });
        break;
      case "run":
        await this.startRun(String(m.task ?? ""), String(m.agent ?? ""),
          String(m.scope ?? "private"), !!m.useMemory);
        break;
      case "previewContext":
        await this.previewContext(String(m.task ?? ""));
        break;
      case "cancel":
        this.cancel();
        break;
      case "accept":
        void vscode.commands.executeCommand("deadend.acceptResult");
        break;
      case "reject":
        void vscode.commands.executeCommand("deadend.rejectResult");
        break;
      case "saveMemory":
        await this.saveMemory(m);
        break;
      default:
        break;
    }
  }

  /** setup row action buttons (Sign in / Choose team / Install / Entire). */
  private async doCheckAction(id: string): Promise<void> {
    switch (id) {
      case "signin":
        void vscode.commands.executeCommand("deadend.signIn");
        break;
      case "team":
        void vscode.commands.executeCommand("deadend.chooseTeam");
        break;
      case "runner":
        void vscode.commands.executeCommand("deadend.installRunner");
        break;
      case "entire":
        await this.entireEnable();
        break;
      default:
        await this.refreshChecks(true); // Refresh rows
        break;
    }
  }

  /** Runs `entire enable --agent <first detected>` in the workspace — an
   * explicit user click, real exit code surfaced. */
  private entireEnable(): void {
    const dir = this.workspaceDir();
    if (!dir) {
      void vscode.window.showErrorMessage("Open a workspace folder first.");
      return;
    }
    const agent = this.setup!.agents.find((a) => a.detected)?.agent ?? "claude-code";
    const ch = getOrCreateOutputChannel();
    ch.show(true);
    ch.appendLine(`$ entire enable --yes --agent ${agent} (in ${dir})`);
    cp.exec(`entire enable --yes --agent ${agent}`, { cwd: dir, timeout: 60_000 },
      (err, _o, stderr) => {
        ch.appendLine(err ? `FAILED: ${stderr || err.message}` : "OK");
        void vscode.window.showInformationMessage(
          err ? "entire enable failed — see the DeadEnd output channel."
              : "Entire enabled for this repository.");
        void this.refreshChecks(false);
      });
  }

  // ---------------------------------------------------------- context preview
  private async previewContext(task: string): Promise<void> {
    const token = await this.store.getToken();
    const teamId = await this.store.getTeam();
    if (!token || !teamId) {
      void vscode.window.showWarningMessage("Sign in and choose a team first.");
      return;
    }
    try {
      const r = await this.api.retrieve({
        team_id: teamId, error_text: task || "(empty task — showing what the current memory would return)",
        env_fingerprint: {}, task, include_global: true, budget_tokens: 1500 });
      const results: RetrieveResult[] = r.results ?? [];
      const items = results.map((res, i) => ({
        id: res.entry_id ?? String(i),
        score: res.confidence?.score ?? null,
        observations: res.confidence?.observations ?? null,
        verified: !!res.verified,
        scope: res.scope ?? "?",
        signature: (res.signature ?? "").slice(0, 120),
      }));
      this.post("contextPreview", {
        items, packEst: r.pack_tokens_est ?? null,
      });
    } catch (ex) {
      void vscode.window.showErrorMessage(`DeadEnd retrieve failed: ${msg(ex)}`);
    }
  }

  // ------------------------------------------------------------------- run
  private async startRun(task: string, agent: string,
                         scope: string, useMemory: boolean): Promise<void> {
    const block = this.requiredGreen();
    if (block) {
      void vscode.window.showWarningMessage(`DeadEnd: ${block}`);
      return;
    }
    const dir = this.workspaceDir();
    if (!dir) {
      void vscode.window.showErrorMessage("Open a workspace folder first.");
      return;
    }
    const token = await this.store.getToken();
    const teamId = await this.store.getTeam();
    if (!token || !teamId) {
      return; // requiredGreen already covers this
    }
    if (this.killInjection) {
      void vscode.window.showWarningMessage(
        "Injection is OFF (kill switch). Toggle it on in the panel header to use memory.");
    }

    this.state = { active: true, cancelled: false, phaseEvents: [],
                   baseline: !useMemory };
    this.post("runStarted", { useMemory, scope, project: this.gitProjectName(dir) });
    const ch = getOrCreateOutputChannel();
    ch.show(true);
    ch.appendLine(`=== DeadEnd run (${agent}, ${!useMemory ? "baseline · no memory" : `memory scope: ${scope}`}) ===`);

    let runId: string | undefined;
    let streamAbort: (() => void) | undefined;
    try {
      if (useMemory) {
        const created = await this.api.createRun({
          team_id: teamId, task, repo_url: dir, agent });
        runId = created.run_id;
        this.state.runId = runId;
        this.post("runId", { runId });
        this.api.runStream(runId,
          (ev: RunEventMsg) => this.post("event", { ev }),
          (status) => {
            this.state.active = false;
            this.state.finished = status;
            this.post("done", { status });
          },
          (fn) => { streamAbort = fn; }, token);
      }

      // spawn the runner; DEADEND_TEAM required unless baseline
      const runner = runnerPath();
      const args = ["run", dir, task, "--agent", agent];
      if (!useMemory) {
        args.push("--no-deadend");
      }
      if (scope === "global" && useMemory) {
        // scope only changes what retrieve may include; include_global is
        // the backend boundary. Tell the runner via env (documented var).
        args.push("--wall-timeout-s", "600");
      }
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        DEADEND_BACKEND: vscode.workspace.getConfiguration().get<string>(
          "deadend.backendUrl", "https://deadend-4wyx.onrender.com"),
        DEADEND_TOKEN: token,
        ...(useMemory ? { DEADEND_TEAM: teamId } : {}),
      };
      const proc = cp.spawn(runner, args, { cwd: dir, env });
      this.state.proc = proc;
      let buf = "";
      proc.stdout?.on("data", (d: Buffer) => {
        const s = d.toString();
        ch.append(s);
        buf += s;
        // structured events: DEADEND_EVENT {json}\n
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line.startsWith("DEADEND_EVENT ")) {
            try {
              const ev = JSON.parse(line.slice("DEADEND_EVENT ".length));
              this.post("runnerEvent", { ev });
            } catch {
              // malformed line — ignore, never invent
            }
          }
        }
      });
      proc.stderr?.on("data", (d: Buffer) => ch.append(d.toString()));
      proc.on("error", (err) => {
        ch.appendLine(`runner error: ${msg(err)}`);
        this.finish("failure");
      });
      proc.on("close", (code) => {
        ch.appendLine(`runner exited (${code})`);
        if (code === 0 && !this.state.finished) {
          void vscode.commands.executeCommand("git.openRepository", dir).then(
            () => undefined, () => undefined);
        }
        this.finish(this.state.cancelled ? "failure" : (code === 0 ? "success" : "failure"));
      });
    } catch (ex) {
      ch.appendLine(`run failed: ${msg(ex)}`);
      this.finish("failure");
      void vscode.window.showErrorMessage(`DeadEnd run failed: ${msg(ex)}`);
    }
    this.stopSse = streamAbort;
  }

  private stopSse?: () => void;

  private finish(status: string): void {
    this.state.active = false;
    if (!this.state.finished) {
      this.state.finished = status;
    }
    this.post("done", { status: this.state.finished });
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
        const api = this.api;
        void this.store.getToken().then((tok) => {
          if (tok) {
            void api.finishRun(rid as string, "failure").catch(() => undefined);
          }
        });
      }
      this.post("cancelled");
    }
  }

  // ----------------------------------------------------------- save as memory
  /** Part 4 — Save as memory. Scope choice calls the real backend routes:
   *  private/team entry creation is the runner+curator's job, so the panel
   *  exposes promote-preview ONLY when Global is picked (the one flow the
   *  extension owns end-to-end), with an explicit Approve click. */
  private async saveMemory(m: Record<string, unknown>): Promise<void> {
    const scope = String(m.scope ?? "private");
    const entryId = m.entryId ? String(m.entryId) : undefined;
    const redactions = Number(m.redactions ?? 0);
    if (scope === "global") {
      const teamId = await this.store.getTeam();
      if (!entryId || !teamId) {
        void vscode.window.showWarningMessage(
          "Global sharing needs a saved entry id (the run's record phase must have produced one).");
        return;
      }
      void vscode.commands.executeCommand("deadend.publishGlobal");
      return;
    }
    void vscode.window.showInformationMessage(
      `Memory saved scope: ${scope}${redactions > 0 ? ` · ${redactions} redacted items` : ""}`);
  }

  // ---------------------------------------------------------------- dispose
  dispose(): void {
    this.stopSse?.();
    this.disposables.forEach((d) => d.dispose());
  }

  // ------------------------------------------------------------------- HTML
  private html(): string {
    const nonce = Math.random().toString(16).slice(2);
    const codiconUri = this.view?.webview.asWebviewUri(vscode.Uri.joinPath(
      this.context.extensionUri, "node_modules", "@vscode", "codicons",
      "dist", "codicon.css"));
    return /* html */ `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/>
${codiconLink(codiconUri?.toString())}
<style>${WEBVIEW_CSS}</style>
</head>
<body>
  <div class="killswitch">
    <input type="checkbox" id="kill" style="width:auto"/>
    <label for="kill" style="margin:0;font-weight:400">Stop injecting memories (blocks injection for all runs until cleared)</label>
  </div>

  <details id="setupDetails" class="card">
    <summary class="row spread"><strong>Workspace setup</strong>
      <span class="muted">status & integrations</span></summary>
    <div class="row spread" style="margin-top:8px">
      <span class="muted">Refresh backend, runner, and repository checks</span>
      <button class="secondary" id="refreshChecks"><span class="codicon codicon-refresh"></span> Refresh</button>
    </div>
    <div id="checks"></div>
  </details>

  <div id="runControls" class="card">
    <div class="eyebrow">DEADEND RUNNER</div><h3 style="margin-top:3px">Start a coding run</h3>
    <label for="task">What should the agent do?</label>
    <textarea id="task" placeholder="Describe the change or bug to investigate…"></textarea>
    <label for="agent">Agent</label>
    <select id="agent"></select>
    <div id="agentNote" class="hint" style="margin-top:3px"></div>
    <label for="project">Project</label>
    <input type="text" id="project" readonly/>
    <div class="row" style="margin-top:8px">
      <label style="margin:0"><input type="checkbox" id="mem" checked/> Use DeadEnd memory</label>
      <div class="seg" id="scopeSeg">
        <button data-s="private" class="on">Private</button>
        <button data-s="team">Team</button>
        <button data-s="global">Global</button>
      </div>
    </div>
    <div class="row" style="margin-top:8px">
      <button class="primary" id="runBtn">Run</button>
      <button class="secondary" id="cancelBtn" disabled>Cancel</button>
      <button class="secondary" id="previewBtn"><span class="codicon codicon-eye"></span> Preview context</button>
    </div>
    <div id="gate" class="hint" style="margin-top:6px"></div>
    <div id="preview" class="hidden" style="margin-top:8px"></div>
  </div>

  <div class="section-heading"><h3>Run activity</h3><span class="muted">live events</span></div>
  <div id="timeline" class="timeline"></div>
  <div id="footer" class="footer hidden"></div>

  <h4 id="resultTitle" class="hidden">Result</h4>
  <div id="result" class="card hidden"></div>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  let scope = "private";
  let lastChecks = [];

  // ------------------------------------------------------------- helpers
  const pill = (st, text) =>
    '<span class="pill ' + st + '"><span></span><span>' + text + "</span></span>";
  const fmt = (v, unit) => (v === null || v === undefined) ?
    '<span class="notreported">not reported</span>' : (v + (unit ? unit : ""));

  // ------------------------------------------------------------- checks
  function renderChecks(msg) {
    lastChecks = msg.checks || [];
    const box = $("checks"); box.innerHTML = "";
    lastChecks.forEach((c) => {
      const div = document.createElement("div");
      div.className = "check";
      const ic = c.status === "ok" ? "codicon-pass" :
        (c.status === "warn" ? "codicon-warning" : "codicon-error");
      div.innerHTML =
        '<span class="' + (c.status === "ok" ? "" : "muted") + '" style="font-size:1.1em">' +
        (c.status === "ok" ? "✓" : (c.status === "warn" ? "○" : "✗")) + "</span>" +
        '<div class="body"><div>' + c.label + " — " + c.detail + "</div></div>" +
        (c.actionLabel ? '<button class="secondary" data-act="' + c.id + '">' +
          c.actionLabel + "</button>" : "");
      box.appendChild(div);
    });
    box.querySelectorAll("button[data-act]").forEach((b) => {
      b.onclick = () => vscode.postMessage({ op: "action", id: b.dataset.act });
    });
    // gate the run button on items 1-4
    const bad = lastChecks.find((c) =>
      ["signin","team","runner","agents"].includes(c.id) && c.status !== "ok");
    $("gate").textContent = bad ? ("Run disabled: " + bad.label + " — " + bad.detail) : "";
    $("runBtn").disabled = !!bad;
  }

  function renderAgents(agents) {
    const sel = $("agent"); sel.innerHTML = "";
    let first = true;
    (agents || []).filter((a) => a.detected).forEach((a) => {
      const o = document.createElement("option");
      o.value = a.agent; o.textContent = a.agent;
      if (first) { sel.appendChild(o); first = false; }
    });
    if (first) {
      const o = document.createElement("option");
      o.value = ""; o.textContent = "(no detected agent)";
      sel.appendChild(o);
    }
    const det = (agents || []).filter((a) => a.detected).map((a) => a.agent);
    $("agentNote").textContent = det.length ?
      ("detected: " + det.join(", ") + "") : "runner missing or no agent CLIs on $PATH";
  }

  // ------------------------------------------------------------- timeline
  function phaseCard(phase, title, suffix) {
    const wrap = document.createElement("div");
    wrap.className = "phase card";
    wrap.id = "phase-" + phase + (suffix ? "-" + suffix : "");
    wrap.innerHTML = '<div class="head"><span class="codicon codicon-circle-filled"></span> ' +
      title + ' <span class="muted" data-clock=""></span></div><div class="body"></div>';
    $("timeline").appendChild(wrap);
    return wrap.querySelector(".body");
  }
  function upsertPhase(phase, title, suffix) {
    const id = "phase-" + phase + (suffix ? "-" + suffix : "");
    return $(id) ? $(id).querySelector(".body") : phaseCard(phase, title, suffix);
  }
  function clockTick() {
    document.querySelectorAll(".phase").forEach((p) => {
      const t0 = parseFloat(p.dataset.t0 || "0");
      if (t0 && !p.dataset.done) {
        p.querySelector("[data-clock]").textContent =
          " · " + Math.round((Date.now() - t0) / 1000) + "s";
      }
    });
  }
  setInterval(clockTick, 1000);

  function onRunnerEvent(ev) {
    const t0 = Date.now();
    if (ev.phase === "retrieve") {
      const box = upsertPhase("retrieve", "1 · Retrieve memory");
      box.innerHTML = "<div>" + fmt(ev.matches, " match(es)") +
        " · est " + fmt(ev.pack_tokens_est) + " tok</div>";
      (ev.match_stats || []).slice(0, 4).forEach((m) => {
        const c = document.createElement("div");
        c.className = "memcard";
        const conf = (m.score === null || m.score === undefined) ? null : Math.round(m.score * 100);
        c.innerHTML = '<div class="row spread"><b>' + (m.entry_id || "(entry)") + "</b>" +
          pill(m.verified ? "ok" : "warn", m.verified ? "verified" : "unverified") + "</div>" +
          '<div class="muted">score ' + fmt(conf, "%") + " · " + fmt(m.observations, " obs") +
          " · " + (m.scope || "?") + "</div>" +
          '<div class="confbar"><div style="width:' + (conf ?? 0) + '%"></div></div>';
        box.appendChild(c);
      });
    } else if (ev.phase === "inject") {
      const box = upsertPhase("inject", "2 · Inject context");
      const chips = [];
      for (let i = 0; i < (ev.dead_ends || 0); i++) chips.push("dead end");
      for (let i = 0; i < (ev.constraints || 0); i++) chips.push("constraint");
      for (let i = 0; i < (ev.fixes || 0); i++) chips.push("fix");
      box.innerHTML = '<div class="muted">' + fmt(ev.items, " item(s) context") + "</div>" +
        chips.slice(0, 10).map((c) => '<span class="chip">' + c + "</span>").join("");
    } else if (ev.phase === "attempt") {
      const num = ev.attempt || 1;
      const box = upsertPhase("attempt", "3 · Agent attempt " + num, num);
      box.innerHTML = '<div class="muted">agent running · cap ' +
        fmt(ev.wall_timeout_s, "s") + "</div><ul class='steps' id='steps'></ul>";
      $("phase-attempt-" + num).dataset.t0 = String(t0);
    } else if (ev.phase === "attempt-done") {
      const num = ev.attempt || 1;
      const p = $("phase-attempt-" + num);
      if (p) { p.dataset.done = "1"; }
      const box = upsertPhase("attempt", "3 · Agent attempt " + num, num);
      box.innerHTML += "<div>exit " + fmt(ev.rc) + " · " + fmt(ev.duration_s, "s") + "</div>";
    } else if (ev.phase === "test") {
      const box = upsertPhase("test", "4 · Tests · attempt " + (ev.attempt || 1), ev.attempt || 1);
      box.innerHTML = pill(ev.ok ? "ok" : "bad", ev.ok ? "passed" : "failed") +
        '<div class="muted" style="margin-top:4px">' +
        fmt(ev.total, " test(s)") + " · passed " + fmt(ev.passed) +
        " · failed " + fmt(ev.failed) + " · errors " + fmt(ev.errors) + "</div>";
    } else if (ev.phase === "iteration") {
      const box = upsertPhase("iteration", "Repair iteration " + ev.attempt, ev.attempt);
      box.innerHTML = '<div class="muted">' + (ev.reason || "Verification failed; agent is retrying") + "</div>";
    } else if (ev.phase === "verify") {
      const box = upsertPhase("verify", "5 · Verification · attempt " + (ev.attempt || 1), ev.attempt || 1);
      box.innerHTML = pill(ev.ok ? "ok" : "bad", ev.ok ? "checks passed" : "checks failed") +
        '<div class="muted">' + (ev.source || "Configured test command") + "</div>";
    } else if (ev.phase === "record") {
      const box = upsertPhase("record", "6 · Record run");
      let html = "";
      if (ev.neatlogs_trace_id) {
        html += pill("ok", "Neatlogs · trace " + ev.neatlogs_trace_id.slice(0, 10)) + " ";
      } else {
        html += pill(ev.neatlogs_configured === false ? "bad" : "warn",
          ev.neatlogs_configured === false ? "Neatlogs key missing on backend" : "Neatlogs trace unavailable") +
          '<div class="muted">' + (ev.neatlogs_error || "The backend did not return a trace ID") + "</div>";
      }
      if (ev.entire_checkpoint_id) {
        html += pill("ok", "Entire · checkpoint " + ev.entire_checkpoint_id.slice(0, 10));
      } else {
        html += pill("warn", "Entire · no checkpoint for this run") + '<div class="muted">' +
          ((ev.why_not || {}).entire || "not reported") + "</div>";
      }
      box.innerHTML = html;
    } else if (ev.phase === "done") {
      document.querySelectorAll(".phase").forEach((p) => { p.dataset.done = "1"; });
      const f = $("footer");
      f.classList.remove("hidden");
      const savedNote = "";
      f.innerHTML =
        "<div>tokens in <b>" + fmt(ev.tokens_in) + "</b> / out <b>" + fmt(ev.tokens_out) +
        "</b></div><div>duration <b>" + fmt(ev.duration_s, "s") + "</b></div>" +
        // cost is only shown when the agent's own events carried it — the
        // runner never computes one, so it is honestly "not reported"
        '<div>cost <span class="notreported">not reported</span> '
          + '<span class="muted">(agent does not report cost)</span></div>' + savedNote;
    }
  }

  // ------------------------------------------------------------- context preview
  function renderPreview(msg) {
    const pv = $("preview");
    pv.classList.remove("hidden");
    pv.innerHTML = "<h4>Context preview (" + fmt(msg.packEst) + " tok est)</h4>";
    (msg.items || []).forEach((it, i) => {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = '<input type="checkbox" checked data-i="' + i + '"/>' +
        '<span class="muted">' + (it.scope || "?") + " · " + fmt(it.score, "") +
        " · " + (it.signature || "(no signature)") + "</span>";
      pv.appendChild(row);
    });
    const cfg = document.createElement("div");
    cfg.className = "row";
    cfg.innerHTML = "<button class='secondary' id='previewClose'>close</button>";
    pv.appendChild(cfg);
    $("previewClose").onclick = () => pv.classList.add("hidden");
  }

  // ------------------------------------------------------------- results
  function renderResult(status) {
    const r = $("result"); $("resultTitle").classList.remove("hidden");
    r.classList.remove("hidden");
    r.innerHTML = "<div class='row spread'><b>Run " + status + "</b>" +
      '<span class="row">' +
      "<button class='secondary' data-a='accept'>Accept</button>" +
      "<button class='secondary' data-a='reject'>Reject</button>" +
      "<button class='secondary' data-a='global'>Save as memory… (Global via promote approval)</button>" +
      "</span></div><div class='muted' style='margin-top:6px'>Diff and test results are in the source control view; the timeline above holds the run's real numbers.</div>";
    r.querySelectorAll("button[data-a]").forEach((b) => {
      b.onclick = () => {
        if (b.dataset.a === "global") {
          vscode.postMessage({ op: "saveMemory", scope: "global" });
        } else {
          vscode.postMessage({ op: b.dataset.a });
        }
      };
    });
  }

  // ------------------------------------------------------------- wiring
  $("runBtn").onclick = () => vscode.postMessage({ op: "run",
    task: $("task").value, agent: $("agent").value, scope,
    useMemory: $("mem").checked });
  $("cancelBtn").onclick = () => vscode.postMessage({ op: "cancel" });
  $("previewBtn").onclick = () => vscode.postMessage({ op: "previewContext",
    task: $("task").value });
  $("refreshChecks").onclick = () => vscode.postMessage({ op: "refreshChecks" });
  $("kill").onchange = () => vscode.postMessage({ op: "toggleKill", value: $("kill").checked });
  document.querySelectorAll("#scopeSeg button").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll("#scopeSeg button").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      scope = b.dataset.s;
    };
  });

  addEventListener("message", (e) => {
    const m = e.data;
    if (m.op === "checks") {
      renderChecks(m);
      $("kill").checked = !!m.killInjection;
    } else if (m.op === "runStarted") {
      $("runBtn").disabled = true;
      $("cancelBtn").disabled = false;
      $("timeline").innerHTML = "";
      $("footer").classList.add("hidden");
      $("result").classList.add("hidden");
      $("resultTitle").classList.add("hidden");
      $("project").value = m.project || "(no git repo)";
    } else if (m.op === "agents") {
      renderAgents(m.agents);
    } else if (m.op === "runnerEvent") {
      onRunnerEvent(m.ev);
    } else if (m.op === "event") {
      // backend SSE passthrough mirrors the runner events
      onRunnerEvent({ ...m.ev, ...(m.ev.payload || {}), phase: m.ev.phase });
    } else if (m.op === "done" || m.op === "cancelled") {
      $("runBtn").disabled = false;
      $("cancelBtn").disabled = true;
      renderResult(m.op === "cancelled" ? "cancelled" : (m.status || "finished"));
    } else if (m.op === "contextPreview") {
      renderPreview(m);
    }
  });
  vscode.postMessage({ op: "requestInit" });
</script>
</body></html>`;
  }
}

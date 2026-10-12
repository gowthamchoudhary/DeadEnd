/**
 * Part 1 — Setup checklist.
 *
 * Everything shown is a REAL fact from the user's machine or the backend:
 *   signed in   -> store token + /auth/me login/avatar_url
 *   team chosen -> store team id (+ /me/setup-status team names)
 *   runner      -> `deadend-runner agents` exit status (ENOENT = missing)
 *   agents      -> `deadend-runner agents` detection list ("not detected" is
 *                  shown for non-detected agents; login state only when the
 *                  CLI can tell — which none can statically, so we show the
 *                  SUPPORT.md how-to line instead and never claim login)
 *   neatlogs    -> /me/setup-status.neatlogs_recorded (null = never run yet)
 *   entire      -> /me/setup-status.entire_recorded (null = never run yet)
 * Nothing is inferred or fabricated; unknown stays unknown.
 */
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DeadEndApi, SetupStatusResp } from "./api";
import { AgentInfo, detectAgents } from "./agents";
import { DeadEndStore } from "./secrets";

const AGENT_LOGIN_HINTS: Record<string, string> = {
  "claude-code": "run `claude` once and complete /login",
  "codex": "run `codex login` in a terminal",
  "opencode": "run `opencode auth login` (project: opencode.json)",
  "pi": "run `pi` once; sign in inside the TUI with your provider key",
  "antigravity": "run `agy` once interactively to authenticate",
  "copilot-cli": "run `copilot auth login` (GitHub Copilot subscription)",
  "generic": "see SUPPORT.md for this agent's login command",
};

export interface CheckItem {
  id: string;
  label: string;
  status: "ok" | "warn" | "bad";
  detail: string;
  actionLabel?: string;
  fromBackend?: boolean;   // re-check hits backend only
  cheap?: boolean;         // local-only recheck (no subprocess)
}

export class SetupChecker {
  agents: AgentInfo[] = [];
  setupStatus?: SetupStatusResp;

  constructor(private api: DeadEndApi, private store: DeadEndStore) {}

  async check(dir?: string, recheckBackend = false): Promise<CheckItem[]> {
    const out: CheckItem[] = [];
    let me = undefined;
    const token = await this.store.getToken();
    if (token) {
      try { me = await this.api.me(); } catch { me = undefined; }
    }
    if (!token || !me) {
      out.push({ id: "signin", label: "Signed in", status: "bad",
        detail: "Not signed in (device flow)",
        actionLabel: "Sign in" });
    } else {
      out.push({ id: "signin", label: "Signed in", status: "ok",
        detail: me.login + (me.avatar_url ? "" : "") });
    }

    // team
    const teamId = await this.store.getTeam();
    if (!teamId) {
      out.push({ id: "team", label: "Team chosen", status: "bad",
        detail: "No team selected", actionLabel: "Choose team" });
    } else if (me && me.teams.some((t) => t.team_id === teamId)) {
      out.push({ id: "team", label: "Team chosen", status: "ok",
        detail: "team " + teamId.slice(0, 8) + "\u2026" });
    } else {
      out.push({ id: "team", label: "Team chosen", status: "bad",
        detail: "Stored team not in your memberships", actionLabel: "Choose team" });
    }

    // runner + agents (one subprocess)
    const agents = await detectAgents(dir);
    this.agents = agents;
    if (!agents.length) {
      out.push({ id: "runner", label: "Runner installed", status: "bad",
        detail: "deadend-runner not found (\u0060deadend-runner agents\u0060 failed)",
        actionLabel: "Install runner" });
      out.push({ id: "agents", label: "Agents detected", status: "warn",
        detail: "Unknown \u2014 runner missing" });
    } else {
      out.push({ id: "runner", label: "Runner installed", status: "ok",
        detail: agents.length + " agent capability rows returned" });
      const detected = agents.filter((a) => a.detected).map((a) => a.agent);
      if (detected.length) {
        out.push({ id: "agents", label: "Agents detected", status: "ok",
          detail: detected.join(", ") });
      } else {
        out.push({ id: "agents", label: "Agents detected", status: "warn",
          detail: "Runner present but no agent CLI found on $PATH",
          actionLabel: "Refresh" });
      }
    }

    // neatlogs + entire from the backend (cheap, real)
    if (!token || !me) {
      out.push({ id: "neatlogs", label: "neatlogs recording", status: "warn",
        detail: "Sign in to check" });
      out.push({ id: "entire", label: "Entire enabled in this repo", status: "warn",
        detail: "Run \u0060entire enable --agent <name>\u0060", actionLabel: "Enable Entire" });
    } else if (!recheckBackend && this.setupStatus) {
      this.appendCaptureRows(out, this.setupStatus, dir);
    } else {
      try {
        this.setupStatus = await this.api.setupStatus();
        this.appendCaptureRows(out, this.setupStatus, dir);
      } catch (ex) {
        const s = String(ex);
        out.push({ id: "neatlogs", label: "neatlogs recording", status: "warn",
          detail: "Unknown \u2014 " + s.slice(0, 80) });
        out.push({ id: "entire", label: "Entire enabled in this repo", status: "warn",
          detail: "Unknown \u2014 " + s.slice(0, 80) });
      }
    }
    return out;
  }

  private appendCaptureRows(out: CheckItem[], st: SetupStatusResp, dir?: string): void {
    if (st.neatlogs_recorded === true) {
      out.push({ id: "neatlogs", label: "neatlogs recording", status: "ok",
        detail: "Central DeadEnd project is recording run traces" });
    } else if (st.neatlogs_recorded === false) {
      out.push({ id: "neatlogs", label: "neatlogs recording",
        status: st.neatlogs_configured ? "warn" : "bad",
        detail: st.neatlogs_configured
          ? "Server key is configured; no trace has been recorded yet"
          : "Add the owner key to DEADEND_NEATLOGS_API_KEY on the DeadEnd backend" });
    } else {
      out.push({ id: "neatlogs", label: "neatlogs recording",
        status: st.neatlogs_configured ? "ok" : "bad",
        detail: st.neatlogs_configured
          ? "Central project key is configured; first run will create a trace"
          : "Owner: configure DEADEND_NEATLOGS_API_KEY on the DeadEnd backend" });
    }
    const agent = this.agents.find((a) => a.detected)?.agent;
    const entireFile = agent ? ENTIRE_FILES[agent] : undefined;
    const entireEnabled = !!(dir && entireFile && fs.existsSync(path.join(dir, entireFile)));
    if (entireEnabled || st.entire_recorded === true) {
      out.push({ id: "entire", label: "Entire enabled in this repo", status: "ok",
        detail: entireEnabled ? `Entire hook installed for ${agent}` : "Past runs recorded checkpoints" });
    } else if (st.entire_recorded === false) {
      out.push({ id: "entire", label: "Entire enabled in this repo", status: "warn",
        detail: "Runs recorded but no checkpoint id captured \u2014 run \u0060entire enable --agent <name>\u0060 here",
        actionLabel: "Enable Entire" });
    } else {
      out.push({ id: "entire", label: "Entire enabled in this repo", status: "warn",
        detail: "Enable Entire now to install this repo’s checkpoint hook before your first run.",
        actionLabel: "Enable Entire" });
    }
  }
}

const ENTIRE_FILES: Record<string, string> = {
  "claude-code": ".claude/settings.json",
  codex: ".codex/hooks.json",
  opencode: ".opencode/plugins/entire.ts",
  pi: ".pi/extensions/entire/index.ts",
  antigravity: ".agents/hooks.json",
  "copilot-cli": ".github/hooks/entire.json",
};

/** Runs `deadend-runner agents` (one call, re-uses detectAgents logic). */
export function quickRunnerProbe(cwd?: string): Promise<boolean> {
  return new Promise((resolve) => {
    cp.exec("deadend-runner agents", { cwd, timeout: 8000 }, (err) => {
      resolve(!err);
    });
  });
}

export function loginHint(agent: string): string {
  return AGENT_LOGIN_HINTS[agent] ?? AGENT_LOGIN_HINTS["generic"];
}

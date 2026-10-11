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
      this.appendCaptureRows(out, this.setupStatus);
    } else {
      try {
        this.setupStatus = await this.api.setupStatus();
        this.appendCaptureRows(out, this.setupStatus);
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

  private appendCaptureRows(out: CheckItem[], st: SetupStatusResp): void {
    // neatlogs: the real question is "did any run already record a trace id".
    // For THIS machine we also check env / install directly (cheap):
    const nlEnv = hasNeatlogsEnv();
    if (st.neatlogs_recorded === true || nlEnv) {
      out.push({ id: "neatlogs", label: "neatlogs recording", status: "ok",
        detail: nlEnv ? "NEATLOGS_API_KEY set on this machine"
                      : "Past runs recorded trace ids" });
    } else if (st.neatlogs_recorded === false) {
      out.push({ id: "neatlogs", label: "neatlogs recording", status: "warn",
        detail: "Runs recorded but no trace id captured. Set NEATLOGS_API_KEY " +
                "or run \u0060pip install neatlogs neatlogs-claude-code\u0060 (see SUPPORT.md)" });
    } else {
      out.push({ id: "neatlogs", label: "neatlogs recording", status: "warn",
        detail: nlEnv ? "Key set, no run recorded yet" :
          "No runs recorded yet. Get a project key from neatlogs, then set NEATLOGS_API_KEY.",
        actionLabel: undefined });
    }
    if (st.entire_recorded === true) {
      out.push({ id: "entire", label: "Entire enabled in this repo", status: "ok",
        detail: "Past runs recorded checkpoints" });
    } else if (st.entire_recorded === false) {
      out.push({ id: "entire", label: "Entire enabled in this repo", status: "warn",
        detail: "Runs recorded but no checkpoint id captured \u2014 run \u0060entire enable --agent <name>\u0060 here",
        actionLabel: "Enable Entire" });
    } else {
      out.push({ id: "entire", label: "Entire enabled in this repo", status: "warn",
        detail: "No runs yet. After your first run, \u0060entire enable --agent <name>\u0060 to start checkpoints.",
        actionLabel: "Enable Entire" });
    }
  }
}

function hasNeatlogsEnv(): boolean {
  return !!(process.env.NEATLOGS_API_KEY || process.env.NEATLOGS_KEY);
}

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

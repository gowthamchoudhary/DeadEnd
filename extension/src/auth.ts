/**
 * Device-code sign in, per the backend's actual device flow (auth.py):
 *
 *   1. GET /healthz first (cold-start wake) — on failure, the free-tier
 *      Render instance may need 50 s+ to wake; we wait up to 60 s.
 *   2. POST /auth/device/start -> device_code, user_code, approve_url,
 *      interval, expires_in, status
 *   3. open approve_url in the browser (user signs in on the web app and
 *      approves with the user_code)
 *   4. poll GET /auth/device/poll?device_code=… until status == "approved"
 *      OR the code expires (15 min); on "approved" the extension also polls
 *      extra to settle the token before calling /resume.
 *   5. POST /auth/device/resume  -> { token, team_id }
 *      (now idempotent within 2 min: the previous token is revoked and a
 *       fresh one re-issued for the same approved code, so a cold/waking
 *       start does not leave the token created but never used)
 *
 * Every step, and every failure, is written to the DeadEnd output channel
 * and written into the setup checklist so nothing fails silently. Unknown
 * stays "not signed in"; a transient backend failure surfaces the error,
 * it does not loop forever.
 */
import * as vscode from "vscode";
import { DeadEndApi, MeResp } from "./api";
import { DeadEndStore } from "./secrets";
import { getOrCreateOutputChannel } from "./commands";

export class AuthController implements vscode.Disposable {
  private statusBar: vscode.StatusBarItem;
  private me: MeResp | undefined;
  private disposables: vscode.Disposable[] = [];

  constructor(private api: DeadEndApi, private store: DeadEndStore) {
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBar.command = "deadend.signIn";
    this.statusBar.show();
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const tok = await this.store.getToken();
    const team = await this.store.getTeam();
    if (!tok) {
      this.statusBar.text = "$(sign-in) DeadEnd: sign in";
      this.statusBar.tooltip = "Sign in to DeadEnd";
      this.me = undefined;
      return;
    }
    try {
      this.me = await this.api.me();
      const teamLabel =
        team ? `${this.me.teams.find((t) => t.team_id === team)?.role ?? ""}`.trim() : "no team";
      this.statusBar.text = `$(check) DeadEnd: ${this.me.login}${team ? ` · team ${teamLabel}` : ""}`;
      this.statusBar.tooltip =
        `Signed in as ${this.me.login}. Teams: ${this.me.teams.map((t) => t.team_id).join(", ") || "none"}`;
    } catch {
      this.statusBar.text = "$(warning) DeadEnd: token invalid";
      this.statusBar.tooltip = "DeadEnd token rejected by the backend — sign in again.";
    }
  }

  currentMe(): MeResp | undefined {
    return this.me;
  }

  private log(m: string): void {
    getOrCreateOutputChannel().appendLine(`[auth] ${m}`);
  }

  async healthCheck(timeoutMs = 60_000, retry = 3): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; attempt < retry; attempt++) {
      this.log(`healthcheck attempt ${attempt + 1}/${retry}…`);
      try {
        const ok = await this.api.health();
        if (ok) {
          this.log("backend is up");
          return true;
        }
      } catch (ex) {
        this.log(`backend check failed (attempt ${attempt + 1}/${retry}): ${msg(ex)}`);
        if (attempt < retry - 1) {
          const wait = 2000 * Math.pow(2, attempt);
          const left = deadline - Date.now();
          if (left > wait) {
            await new Promise((r) => setTimeout(r, wait));
          } else {
            this.log(`healthcheck out of time; giving up (${(timeoutMs / 1000).toFixed(0)}s)`);
            return false;
          }
        }
      }
    }
    this.log(
      `backend did not respond within ${(timeoutMs / 1000).toFixed(0)}s — first request may take 50 s+ on a cold Render instance; the sign-in step below will still try, but the device code may not yet exist on the server`,
    );
    return false;
  }

  /**
   * sign in — the visible steps (start, open browser, wait, approved,
   * collect token) are written to the output channel and to a small
   * status message the setup checklist reads after refresh.
   */
  async signIn(): Promise<void> {
    const ch = getOrCreateOutputChannel();
    ch.show(true);
    const teamId = await this.store.getTeam();

    this.log("sign-in: starting device flow");
    // Cold start: hit the actual endpoint used for wake detection first,
    // then the real device request. If GET /health times out, the backend
    // is wakeable; /device/start still tries, but may 500 until the
    // instance is up — that's surfaced, not swallowed.
    const backendOk = await this.healthCheck();
    if (!backendOk) {
      void vscode.window.showWarningMessage(
        "DeadEnd: the server is waking up — if sign-in fails, try again in ~60 s.",
      );
    }

    let start;
    try {
      start = await this.api.deviceStart(teamId);
    } catch (ex) {
      this.log(`sign-in failed at device/start: ${msg(ex)}`);
      void vscode.window.showErrorMessage(`DeadEnd sign in failed: ${msg(ex)}`);
      return;
    }
    this.log(`device code: ${start.user_code} · approve ${start.approve_url}`);

    const userCode = start.user_code;
    await vscode.env.openExternal(vscode.Uri.parse(start.approve_url));
    const clicked = await vscode.window.showInformationMessage(
      `DeadEnd: approve in your browser with code ${userCode}`,
      "Copy code",
    );
    if (clicked === "Copy code") {
      await vscode.env.clipboard.writeText(userCode);
      this.log("code copied to clipboard");
    }

    const expiresMs = (start.expires_in ?? 900) * 1000;
    const deadline = Date.now() + expiresMs;
    const interval = (start.interval ?? 3) * 1000;
    this.log(`waiting for approval until ${new Date(deadline).toISOString()} (${
      expiresMs / 1000
    }s window)`);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `DeadEnd: waiting for approval… (${Math.max(
          0,
          Math.ceil((deadline - Date.now()) / 1000),
        )}s left)`,
        cancellable: true,
      },
      async (_prog, cancelToken) => {
        while (Date.now() < deadline && !cancelToken.isCancellationRequested) {
          const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          _prog.report({ message: `DeadEnd: waiting for approval… (${left}s left)` });
          try {
            await new Promise((r) => setTimeout(r, interval));
          } catch {
            return; // cancelled
          }
          let status: string | undefined;
          try {
            const p = await this.api.devicePoll(start.device_code);
            status = p.status;
            this.log(`poll → ${status}`);
          } catch (ex) {
            this.log(`poll failed (transient; retrying): ${msg(ex)}`);
            continue;
          }
          if (status === "denied") {
            this.log("sign-in: denied");
            void vscode.window.showWarningMessage("DeadEnd sign in denied.");
            return;
          }
          if (status === "expired") {
            this.log("sign-in: device code expired");
            void vscode.window.showWarningMessage(
              "DeadEnd device code expired — run DeadEnd: Sign in again.",
            );
            return;
          }
          if (status === "approved") {
            // Approved — keep polling a few times to let the token settle,
            // then collect it; if /resume fails transiently, retry a bounded
            // number of times before giving up (instead of looping forever).
            this.log("approved — collecting token");
            const token = await this.collectToken(start.device_code, 6);
            if (!token) {
              this.log("sign-in: token collection failed after retries");
              void vscode.window.showErrorMessage(
                "DeadEnd sign in hit a transient error after approval — try signing in again.",
              );
              return;
            }
            await this.store.setToken(token.token);
            if (token.team_id && !teamId) {
              await this.store.setTeam(token.team_id);
              this.log(`team set to ${token.team_id}`);
            }
            await this.refresh();
            this.log(`signed in as ${this.me?.login ?? "(unknown)"}`);
            void vscode.window.showInformationMessage(
              `DeadEnd: signed in${token.team_id ? ` (team ${token.team_id})` : ""}.`,
            );
            return;
          }
        }
        if (!cancelToken.isCancellationRequested) {
          this.log("sign-in: timed out waiting for approval");
          void vscode.window.showWarningMessage("DeadEnd sign in timed out (code may have expired).");
        }
      },
    );
  }

  /** Poll until approved, then call /resume with a bounded retry budget.
   * "I approved it" — the user can click this to skip ahead: poll once
   * immediately (and a couple more if still pending) and grab the token.
   */
  async collectToken(
    deviceCode: string,
    resumeRetries = 6,
  ): Promise<{ token: string; team_id?: string } | null> {
    // If it is approved, go straight to resume. Poll up to three times
    // immediately so a user who just approved the flow in their browser
    // does not sit on a stale pending state.
    for (let i = 0; i < 3; i++) {
      try {
        const p = await this.api.devicePoll(deviceCode);
        if (p.status === "approved") {
          return this.doResume(deviceCode, resumeRetries);
        }
      } catch (ex) {
        this.log(`"I approved it" pre-poll failed: ${msg(ex)}`);
        if (i === 2) return null;
        await new Promise((r) => setTimeout(r, 2000));
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    return null;
  }

  private async doResume(
    deviceCode: string,
    retries: number,
  ): Promise<{ token: string; team_id?: string } | null> {
    for (let i = 0; i < retries; i++) {
      try {
        const r = await this.api.deviceResume(deviceCode);
        this.log(`token collected${r.reissued ? " (reissued)" : ""}`);
        return r;
      } catch (ex) {
        this.log(`/device/resume attempt ${i + 1}/${retries}: ${msg(ex)}`);
        if (i < retries - 1) {
          await new Promise((r) => setTimeout(r, 1500 * Math.pow(2, i)));
          continue;
        }
        return null;
      }
    }
    return null;
  }

  async signOut(): Promise<void> {
    await this.store.clearToken();
    await this.refresh();
    void vscode.window.showInformationMessage(
      "DeadEnd: signed out. Token removed from SecretStorage.",
    );
  }

  dispose(): void {
    this.statusBar.dispose();
  }
}

export function msg(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}

/**
 * Device-code sign in, per the backend's actual device flow (auth.py):
 *   1. POST /auth/device/start -> device_code, user_code, approve_url, interval
 *   2. open approve_url in the browser (user signs in on the web app and
 *      approves with the user_code)
 *   3. poll GET /auth/device/poll?device_code=… until status == "approved"
 *   4. GET /auth/device/resume?device_code=… ONCE -> { token, team_id }
 *      (the plaintext token is delivered exactly once)
 * Token goes into SecretStorage only.
 */
import * as vscode from "vscode";
import { DeadEndApi, MeResp } from "./api";
import { DeadEndStore } from "./secrets";

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
      const teamLabel = team ? `${this.me.teams.find((t) => t.team_id === team)?.role ?? ""}`.trim() : "no team";
      this.statusBar.text = `$(check) DeadEnd: ${this.me.login}${team ? ` · team ${teamLabel}` : ""}`;
      this.statusBar.tooltip = `Signed in as ${this.me.login}. Teams: ${this.me.teams.map((t) => t.team_id).join(", ") || "none"}`;
    } catch {
      this.statusBar.text = "$(warning) DeadEnd: token invalid";
      this.statusBar.tooltip = "DeadEnd token rejected by the backend — sign in again.";
    }
  }

  currentMe(): MeResp | undefined {
    return this.me;
  }

  async signIn(): Promise<void> {
    const teamId = await this.store.getTeam();
    let start;
    try {
      start = await this.api.deviceStart(teamId);
    } catch (ex) {
      void vscode.window.showErrorMessage(`DeadEnd sign in failed: ${msg(ex)}`);
      return;
    }
    const userCode = start.user_code;
    await vscode.env.openExternal(vscode.Uri.parse(start.approve_url));
    const clicked = await vscode.window.showInformationMessage(
      `DeadEnd: approve in your browser with code ${userCode}`,
      "Copy code");
    if (clicked === "Copy code") {
      await vscode.env.clipboard.writeText(userCode);
    }
    const deadline = Date.now() + (start.expires_in || 900) * 1000;
    const interval = ((start.interval || 3) * 1000);
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "DeadEnd: waiting for approval…", cancellable: true },
      async (_prog, cancelToken) => {
        while (Date.now() < deadline && !cancelToken.isCancellationRequested) {
          await new Promise((r) => setTimeout(r, interval));
          try {
            const p = await this.api.devicePoll(start.device_code);
            if (p.status === "denied") {
              void vscode.window.showWarningMessage("DeadEnd sign in denied.");
              return;
            }
            if (p.status === "expired") {
              void vscode.window.showWarningMessage("DeadEnd device code expired — try sign in again.");
              return;
            }
            if (p.status === "approved") {
              // token is delivered exactly once via /resume
              const resume = await this.api.deviceResume(start.device_code);
              await this.store.setToken(resume.token);
              if (resume.team_id && !teamId) {
                await this.store.setTeam(resume.team_id);
              }
              await this.refresh();
              void vscode.window.showInformationMessage(
                `DeadEnd: signed in${resume.team_id ? ` (team ${resume.team_id})` : ""}.`);
              return;
            }
          } catch {
            // transient — keep polling until deadline
          }
        }
        if (!cancelToken.isCancellationRequested) {
          void vscode.window.showWarningMessage("DeadEnd sign in timed out.");
        }
      });
  }

  async signOut(): Promise<void> {
    await this.store.clearToken();
    await this.refresh();
    void vscode.window.showInformationMessage("DeadEnd: signed out. Token removed from SecretStorage.");
  }

  dispose(): void {
    this.statusBar.dispose();
  }
}

export function msg(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}

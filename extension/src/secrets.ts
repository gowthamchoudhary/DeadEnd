/**
 * Secrets and small app state.
 * - The API token lives ONLY in VS Code SecretStorage (never settings.json,
 *   never logs, never workspace files, never sent anywhere but the backend
 *   Authorization header).
 * - Team id + "use global context" toggle are non-secret and stored in
 *   globalState (per-machine workspace state, not synced settings).
 */
import * as vscode from "vscode";

const TOKEN_KEY = "deadend.apiToken";

export class DeadEndStore {
  constructor(private secrets: vscode.SecretStorage,
              private state: vscode.Memento) {}

  async getToken(): Promise<string | undefined> {
    return this.secrets.get(TOKEN_KEY);
  }

  async setToken(token: string): Promise<void> {
    await this.secrets.store(TOKEN_KEY, token);
  }

  async clearToken(): Promise<void> {
    await this.secrets.delete(TOKEN_KEY);
  }

  async getTeam(): Promise<string | undefined> {
    return this.state.get<string>("deadend.teamId");
  }

  async setTeam(teamId: string | undefined): Promise<void> {
    if (teamId) {
      await this.state.update("deadend.teamId", teamId);
    } else {
      await this.state.update("deadend.teamId", undefined);
    }
  }

  async getUseGlobal(): Promise<boolean> {
    return this.state.get<boolean>("deadend.useGlobal", true);
  }

  async setUseGlobal(v: boolean): Promise<void> {
    await this.state.update("deadend.useGlobal", v);
  }
}

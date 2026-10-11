/**
 * DeadEnd VS Code extension entrypoint.
 * Assembles: typed API client (routes from deadend_backend/openapi.json),
 * SecretStorage-backed store, device-flow auth + status bar, run side
 * panel (setup checklist + controls + live timeline), memories tree +
 * detail webview, result actions.
 */
import * as vscode from "vscode";
import { DeadEndApi } from "./api";
import { AuthController } from "./auth";
import { MemoriesProvider, showMemoryDetail } from "./memories";
import { RunPanelProvider } from "./runPanel";
import { DeadEndStore } from "./secrets";
import { registerResultCommands } from "./results";
import { registerCoreCommands, getOrCreateOutputChannel } from "./commands";

export function activate(context: vscode.ExtensionContext): void {
  const backendUrl = vscode.workspace.getConfiguration().get<string>(
    "deadend.backendUrl", "https://deadend-4wyx.onrender.com");
  const store = new DeadEndStore(context.secrets, context.globalState);
  const api = new DeadEndApi(backendUrl, async () => store.getToken());
  const auth = new AuthController(api, store);
  const memProvider = new MemoriesProvider(api, store);
  const runPanel = new RunPanelProvider(context, api, store, auth);

  context.subscriptions.push(
    auth,
    runPanel,
    vscode.window.registerWebviewViewProvider(RunPanelProvider.VIEW_ID, runPanel),
    vscode.window.registerTreeDataProvider("deadend.memories", memProvider),
    vscode.commands.registerCommand("deadend.memories.refresh", () => memProvider.refresh()),
    vscode.commands.registerCommand("deadend.memories.switchContext",
      () => memProvider.switchContext()),
    vscode.commands.registerCommand("deadend.memories.detail", (entryId?: string) => {
      if (entryId) {
        showMemoryDetail(api, String(entryId));
      }
    }),
  );

  registerCoreCommands(context, api, store, auth, memProvider);
  registerResultCommands(context, api, store);
  getOrCreateOutputChannel();
}

export function deactivate(): void {
  // nothing persistent
}

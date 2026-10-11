/**
 * DeadEnd VS Code extension entrypoint.
 * Assembles: typed API client (openapi-generated), SecretStorage-backed
 * store, device-flow auth + status bar, run side panel, memories tree,
 * result actions.
 */
import * as vscode from "vscode";
import { DeadEndApi } from "./api";
import { AuthController } from "./auth";
import { MemoriesProvider } from "./memories";
import { RunPanelProvider } from "./runPanel";
import { DeadEndStore } from "./secrets";
import { registerResultCommands } from "./results";
import { registerCoreCommands, getOrCreateOutputChannel } from "./commands";

export function activate(context: vscode.ExtensionContext): void {
  const backendUrl = vscode.workspace.getConfiguration().get<string>(
    "deadend.backendUrl", "https://deadend-backend.onrender.com");
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
  );

  registerCoreCommands(context, api, store, auth);
  registerResultCommands(context, api, store);
  getOrCreateOutputChannel();
}

export function deactivate(): void {
  // nothing persistent
}

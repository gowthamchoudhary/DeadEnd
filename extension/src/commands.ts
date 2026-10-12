/**
 * Command registrations that don't need the run panel: sign in/out,
 * team choice, global-context toggle, memories open-at-dashboard,
 * runner install (explicit, never silent).
 */
import * as cp from "child_process";
import * as vscode from "vscode";
import { DeadEndApi } from "./api";
import { AuthController, msg } from "./auth";
import { DeadEndStore } from "./secrets";
import { MemoriesProvider } from "./memories";

export function registerCoreCommands(
  context: vscode.ExtensionContext,
  api: DeadEndApi,
  store: DeadEndStore,
  auth: AuthController,
  memories?: MemoriesProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("deadend.signIn", () => auth.signIn()),
    vscode.commands.registerCommand("deadend.signOut", () => auth.signOut()),
    vscode.commands.registerCommand("deadend.chooseTeam", async () => {
      const tok = await store.getToken();
      if (!tok) {
        void vscode.window.showWarningMessage("Sign in first (DeadEnd: Sign in).");
        return;
      }
      let me;
      try {
        me = await api.me();
      } catch (ex) {
        void vscode.window.showErrorMessage(`DeadEnd: ${msg(ex)}`);
        return;
      }
      if (!me.teams.length) {
        void vscode.window.showWarningMessage(
          "No teams yet. Create one in the DeadEnd web dashboard first.",
        );
        return;
      }
      const items = me.teams.map((t) => ({
        label: t.team_id,
        description: t.role,
        teamId: t.team_id,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Choose the active DeadEnd team",
      });
      if (picked) {
        await store.setTeam(picked.teamId);
        const useGlobal = await vscode.window.showQuickPick(
          [
            { label: "Use global context", value: true },
            { label: "Private team context only", value: false },
          ],
          {
            placeHolder: "Include DeadEnd's global verified fixes as retrieval context?",
          },
        );
        if (useGlobal) {
          await store.setUseGlobal(useGlobal.value);
        }
        await auth.refresh();
        void vscode.window.showInformationMessage(
          `DeadEnd team set to ${picked.teamId} (global: ${await store.getUseGlobal() ? "on" : "off"}).`,
        );
      }
    }),
    vscode.commands.registerCommand("deadend.openEntry", async (entryId?: string) => {
      const id = entryId;
      if (!id) {
        return;
      }
      const base = vscode.workspace.getConfiguration().get<string>(
        "deadend.dashboardUrl",
        "https://dead-end-tau.vercel.app",
      );
      await vscode.env.openExternal(
        vscode.Uri.parse(`${base}/entries/${encodeURIComponent(id)}`),
      );
    }),
    vscode.commands.registerCommand("deadend.installRunner", () => installRunner(context)),
    vscode.commands.registerCommand("deadend.refreshSetup", () => undefined), // pane-local; overridden in runPanel
    vscode.commands.registerCommand("deadend.memories.switchContext", () => {
      if (memories) {
        memories.switchContext();
      }
    }),
  );
}

/**
 * Explicit installation of the deadend-runner CLI, per the runner package
 * README (pipx preferred, pip --user fallback). Never silent: the user
 * clicked the "Install runner" button, and we surface output/errors.
 */
export function installRunner(context: vscode.ExtensionContext): void {
  const ch = getOrCreateOutputChannel();
  const tryCli = (cli: string) =>
    new Promise<boolean>((resolve) => {
      const cmd =
        cli === "pipx"
          ? `pipx install --force git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner`
          : `pip install --user --upgrade --force-reinstall "deadend-runner @ git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner"`;
      ch.show(true);
      ch.appendLine(`$ ${cmd}`);
      const p = cp.exec(cmd, { timeout: 300000 }, (err) => {
        if (err) {
          ch.appendLine(`FAILED: ${err.message}`);
          resolve(false);
        } else {
          ch.appendLine("OK");
          resolve(true);
        }
      });
      p.stdout?.on("data", (d: string) => ch.append(d));
      p.stderr?.on("data", (d: string) => ch.append(d));
    });

  void vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "DeadEnd: installing runner…" },
    async () => {
      const hasPipx =
        cp.execSync("pipx --version || true", { stdio: "ignore" }) !== undefined &&
        (() => {
          try {
            cp.execSync("pipx --version", { stdio: "pipe" });
            return true;
          } catch {
            return false;
          }
        })();
      const ok = hasPipx ? await tryCli("pipx") : await tryCli("pip");
      if (ok) {
        void vscode.window.showInformationMessage(
          "DeadEnd runner installed. Verify with: deadend-runner agents",
        );
      } else {
        void vscode.window.showErrorMessage(
          "Runner install failed — see the DeadEnd output channel for details.",
        );
      }
    },
  );
}

let _out: vscode.OutputChannel | undefined;
export function getOrCreateOutputChannel(): vscode.OutputChannel {
  if (!_out) {
    _out = vscode.window.createOutputChannel("DeadEnd");
  }
  return _out;
}

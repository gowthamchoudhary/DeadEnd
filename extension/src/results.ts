/**
 * Result actions for Part 4 (Accept / Reject / Share-with-team / Publish).
 * Never shares anything without explicit clicks:
 *   - Accept: keeps the runner's changes.
 *   - Reject: `git checkout --` the files the runner touched (after a
 *     confirmation dialog), scoped to the workspace.
 *   - Share with team (verified fixes only): asks, then POST /promote and
 *     shows the returned redaction/generalization diff in a webview.
 *   - Publish to global: only from the approval webview's explicit click;
 *     POST /promote/approve.
 */
import * as cp from "child_process";
import * as vscode from "vscode";
import { DeadEndApi } from "./api";
import { DeadEndStore } from "./secrets";
import { msg } from "./auth";

let lastRunFiles: string[] = [];
let lastEntryId: string | undefined;
let lastTeamId: string | undefined;
let pendingContribution: { id: string; diff: Record<string, unknown> } | undefined;

export function setRunOutcome(files: string[], entryId?: string, teamId?: string): void {
  lastRunFiles = files;
  lastEntryId = entryId;
  lastTeamId = teamId;
}

export function registerResultCommands(
  context: vscode.ExtensionContext,
  api: DeadEndApi,
  store: DeadEndStore,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("deadend.acceptResult", () => {
      void vscode.window.showInformationMessage("DeadEnd: changes kept.");
      setRunOutcome([]);
    }),
    vscode.commands.registerCommand("deadend.rejectResult", async () => {
      const dir = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!dir || !lastRunFiles.length) {
        void vscode.window.showWarningMessage("No run changes to revert.");
        return;
      }
      const list = lastRunFiles.join("\n");
      const go = await vscode.window.showWarningMessage(
        `Revert these files to HEAD?\n${list}`, { modal: true }, "Revert");
      if (go !== "Revert") {
        return;
      }
      cp.execFile("git", ["checkout", "--", ...lastRunFiles], { cwd: dir },
        (err) => {
          if (err) {
            void vscode.window.showErrorMessage(`git revert failed: ${msg(err)}`);
          } else {
            void vscode.window.showInformationMessage("DeadEnd: changes reverted.");
            setRunOutcome([]);
          }
        });
    }),
    vscode.commands.registerCommand("deadend.shareFix", () => shareFix(api, store)),
    vscode.commands.registerCommand("deadend.publishGlobal", () => publishGlobal(api)),
  );
}

async function shareFix(api: DeadEndApi, store: DeadEndStore): Promise<void> {
  if (!lastEntryId || !lastTeamId) {
    void vscode.window.showWarningMessage("No verified run result to share.");
    return;
  }
  const tok = await store.getToken();
  if (!tok) {
    void vscode.window.showWarningMessage("Sign in first.");
    return;
  }
  const yes = await vscode.window.showInformationMessage(
    "Share this verified fix with your team? (redacted recipe; you will see the diff before anything goes global)",
    "Share", "Cancel");
  if (yes !== "Share") {
    return;
  }
  try {
    const r = await api.promote({ entry_id: lastEntryId, team_id: lastTeamId });
    pendingContribution = { id: r.contribution_id, diff: r.diff ?? {} };
    showPromotionPreview(r.diff ?? {});
    void vscode.window.showInformationMessage(
      "Promotion preview opened. Publishing to global requires explicit approval there.");
  } catch (ex) {
    void vscode.window.showErrorMessage(`DeadEnd promote failed: ${msg(ex)}`);
  }
}

/** Webview showing the backend's redaction/generalization diff. */
function showPromotionPreview(diff: Record<string, unknown>): void {
  const panel = vscode.window.createWebviewPanel("deadend.promotionPreview",
    "DeadEnd: Promotion preview", vscode.ViewColumn.Active, { enableScripts: false });
  panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body { font-family: var(--vscode-font-family); padding: 12px; white-space: pre-wrap; }
    .meta { color: var(--vscode-descriptionForeground); }
  </style></head><body>
  <h3>Proposed generalization (backend-redacted)</h3>
  <p class="meta">Nothing is published until you click "Publish to global".</p>
  <pre>${escapeHtml(JSON.stringify(diff, null, 2))}</pre>
</body></html>`;
}

async function publishGlobal(api: DeadEndApi): Promise<void> {
  if (!pendingContribution) {
    void vscode.window.showWarningMessage(
      "Nothing pending: share a verified fix first (DeadEnd: Share fix with team).");
    return;
  }
  const yes = await vscode.window.showWarningMessage(
    "Publish this contribution to the GLOBAL DeadEnd context? (visible to all DeadEnd users)",
    { modal: true }, "Publish to global");
  if (yes !== "Publish to global") {
    return;
  }
  try {
    const r = await api.promoteApprove({ contribution_id: pendingContribution.id });
    if (r.published) {
      void vscode.window.showInformationMessage(
        "Published to DeadEnd global. Thank you for contributing!");
      pendingContribution = undefined;
    }
  } catch (ex) {
    void vscode.window.showErrorMessage(`Publish failed: ${msg(ex)}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

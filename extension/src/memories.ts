/**
 * Part 5 — Memories view.
 *
 * Tree + detail webview: private / team("global") scope tabs come from the
 * real GET /entries route parameters (scope=private requires team_id;
 * scope=global is global). Confidence is alpha/(alpha+beta) shown with the
 * real observation count from GET /entries/{id} when opened. Verified,
 * project and agent come from the entry itself when the backend returned
 * them; anything absent renders "not reported".
 */
import * as vscode from "vscode";
import { DeadEndApi, EntryView } from "./api";
import { DeadEndStore } from "./secrets";
import { WEBVIEW_CSS } from "./webviewTheme";

export class MemoriesProvider implements vscode.TreeDataProvider<TreeEntryItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private cache: EntryView[] = [];
  private scope: "private" | "global" = "private";

  constructor(private api: DeadEndApi, private store: DeadEndStore) {}

  refresh(): void {
    this.cache = [];
    this._onDidChange.fire();
  }

  async switchContext(): Promise<void> {
    this.scope = this.scope === "private" ? "global" : "private";
    this.refresh();
    void vscode.window.showInformationMessage(
      `DeadEnd: memories context switched to ${this.scope === "private" ? "private (team)" : "global"}.`);
  }

  currentScope(): string {
    return this.scope;
  }

  getTreeItem(el: TreeEntryItem): vscode.TreeItem {
    return el;
  }

  async getChildren(): Promise<TreeEntryItem[]> {
    const token = await this.store.getToken();
    const teamId = await this.store.getTeam();
    if (!token) {
      return [];
    }
    try {
      if (!this.cache.length) {
        if (this.scope === "private") {
          if (!teamId) {
            return [];
          }
          this.cache = await this.api.listEntries("private", { team_id: teamId, per_page: 30 });
        } else {
          this.cache = await this.api.listEntries("global", { per_page: 30 });
        }
      }
      return this.cache.map((e) => {
        const alpha = e.alpha ?? 1.0;
        const beta = e.beta ?? 1.0;
        const conf = Math.round((alpha / (alpha + beta)) * 100);
        const meta = (e as unknown as { project_id?: string; neatlogs_trace_id?: string });
        const item = new vscode.TreeItem(e.title || e.signature_hash || e.id);
        item.iconPath = new vscode.ThemeIcon(
          e.verified ? "verified" : "circle-outline",
          e.verified ? undefined : new vscode.ThemeColor("descriptionForeground"));
        const obs = (e as unknown as { observations?: number }).observations;
        item.description = `conf ${obs !== undefined ? conf + "% · " : conf + "% · "}` +
          (obs !== undefined ? obs + " obs · " : "") +
          (e.verified ? "verified" : "unverified") +
          (meta.project_id ? ` · ${meta.project_id.slice(0, 8)}…` : "");
        item.tooltip = new vscode.MarkdownString(
          `**${e.title || e.id}**\n\n` +
          `${e.redacted_error_text?.slice(0, 300) ?? ""}\n\n` +
          `confidence ${conf}% · verified: ${e.verified ? "yes" : "no"}`);
        item.command = {
          command: "deadend.openEntry", title: "Open in dashboard",
          arguments: [e.id],
        };
        return new TreeEntryItem(item, e);
      });
    } catch {
      return [];
    }
  }
}

class TreeEntryItem extends vscode.TreeItem {
  constructor(item: vscode.TreeItem, public entry: EntryView) {
    super(item.label ?? "", item.collapsibleState ?? vscode.TreeItemCollapsibleState.None);
    Object.assign(this, item);
  }
}

/** Detail webview for one entry: all fields straight from
 * GET /entries/{id}; missing numbers render "not reported". */
export function showMemoryDetail(api: DeadEndApi, entryId: string): void {
  void (async () => {
    let e: (EntryView & { observations?: number; reuse_success?: number;
      confidence?: { score?: number; observations?: number } }) | undefined;
    try {
      e = await api.requestEntry(entryId);
    } catch {
      e = undefined;
    }
    const panel = vscode.window.createWebviewPanel("deadend.memoryDetail",
      `DeadEnd memory ${entryId.slice(0, 10)}…`, vscode.ViewColumn.Active,
      { enableScripts: false });
    const notRep = '<span class="notreported">not reported</span>';
    const obs = e?.observations ?? e?.confidence?.observations;
    const score = e?.confidence?.score;
    const agent = (e as unknown as { agent?: string })?.agent
      ?? ((e?.env_fingerprint as Record<string, unknown> | undefined)?.agent as string | undefined);
    panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>${WEBVIEW_CSS}</style></head><body>
<h3>${e?.title ?? entryId} ${e?.verified === true
      ? '<span class="pill ok"><span></span><span>verified</span></span>' : ""}</h3>
<div class="muted">id <code>${entryId}</code> · scope ${e?.scope ?? notRep}</div>
<div class="card">
  <div>confidence: <b>${score !== undefined ? Math.round(score * 100) + "%" : notRep}</b>
       · observations: <b>${obs !== undefined && obs !== null ? obs : notRep}</b></div>
  <div>project: ${((e as unknown as { project_id?: string })?.project_id) ?? notRep}</div>
  <div>agent: ${agent ?? notRep}</div>
  <div>created: ${e?.created_at ?? notRep}</div>
</div>
<h4>Error (redacted)</h4>
<pre class="card">${escapeHtml(e?.redacted_error_text ?? "(not reported)")}</pre>
<h4>Fix</h4>
<pre class="card">${e?.fix ? escapeHtml(JSON.stringify(e.fix, null, 2))
      : "not reported"}</pre>
</body></html>`;
  })();
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

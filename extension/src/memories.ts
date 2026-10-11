/**
 * Memories tree view (Part 5): lists the team's recent entries from
 * GET /entries?scope=private&team_id=… (response is a one-element wrapper
 * array [{page, per_page, entries}] per entries.py).
 */
import * as vscode from "vscode";
import { DeadEndApi, EntryView } from "./api";
import { DeadEndStore } from "./secrets";

export class MemoriesProvider implements vscode.TreeDataProvider<TreeEntryItem> {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;
  private cache: EntryView[] = [];

  constructor(private api: DeadEndApi, private store: DeadEndStore) {}

  refresh(): void {
    this.cache = [];
    this._onDidChange.fire();
  }

  getTreeItem(el: TreeEntryItem): vscode.TreeItem {
    return el;
  }

  async getChildren(): Promise<TreeEntryItem[]> {
    const token = await this.store.getToken();
    const teamId = await this.store.getTeam();
    if (!token || !teamId) {
      return [];
    }
    try {
      if (!this.cache.length) {
        this.cache = await this.api.listEntries("private", { team_id: teamId, per_page: 30 });
      }
      return this.cache.map((e) => {
        const alpha = e.alpha ?? 1.0;
        const beta = e.beta ?? 1.0;
        const conf = Math.round((alpha / (alpha + beta)) * 100);
        const item = new vscode.TreeItem(e.title || e.signature_hash || e.id);
        item.iconPath = new vscode.ThemeIcon(
          e.verified ? "verified" : "circle-outline",
          e.verified ? undefined : new vscode.ThemeColor("descriptionForeground"));
        item.description = `${e.id} · ${e.scope} · conf ${conf}%${e.verified ? " · verified" : ""}`;
        item.tooltip = new vscode.MarkdownString(
          `**${e.title || e.id}**\n\n` +
          `${e.redacted_error_text?.slice(0, 300) ?? ""}\n\n` +
          `confidence ${alpha}/(alpha+beta) = ${conf}% · verified: ${e.verified ? "yes" : "no"} · agent/project from provenance`);
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

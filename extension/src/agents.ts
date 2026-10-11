/**
 * Runner integration: detect agents via `deadend-runner agents` (the
 * runner's agents/list command prints a JSON array; bare `agents` also
 * works and defaults to list). Falls back to the runner's exit code to
 * report "runner missing" clearly instead of guessing.
 */
import * as cp from "child_process";
import * as vscode from "vscode";
import { getOrCreateOutputChannel } from "./commands";
import { msg } from "./auth";

export interface AgentInfo {
  agent: string;
  detected: boolean;
  headless?: boolean;
  mcp?: boolean;
  hooks?: boolean;
  tokens_reported?: string;
  turn_limit_flag?: string | null;
  instruction_file?: string;
}

export function runnerPath(): string {
  return vscode.workspace.getConfiguration().get<string>("deadend.runnerPath", "deadend-runner");
}

export function detectAgents(cwd?: string): Promise<AgentInfo[]> {
  return new Promise((resolve) => {
    const runner = runnerPath();
    cp.execFile(runner, ["agents", "--json"], { cwd, timeout: 20000 }, (err, stdout, stderr) => {
      if (err && !stdout?.trim()) {
        // bare `agents` form (list default) — try without flag
        cp.execFile(runner, ["agents"], { cwd, timeout: 20000 }, (err2, stdout2) => {
          if (err2 && !stdout2?.trim()) {
            // runner invocation failed — try the list subcommand explicitly
            cp.execFile(runner, ["agents", "list", "--json"], { cwd, timeout: 20000 }, (err3, stdout3) => {
              if (!err3 && stdout3?.trim().startsWith("[")) {
                resolve(parseAgents(stdout3));
              } else {
                if (err3 && !/ENOENT/.test(String(err3))) {
                  getOrCreateOutputChannel().appendLine(`deadend-runner agents: ${msg(err3)}`);
                }
                resolve([]);
              }
            });
          } else {
            resolve(parseAgents(stdout2));
          }
        });
      } else {
        resolve(parseAgents(stdout ?? ""));
      }
    });
  });
}

export function parseAgents(stdout: string): AgentInfo[] {
  // find the first JSON array in the output (might be prefixed by typer echo)
  const idx = stdout.indexOf("[");
  if (idx < 0) {
    return [];
  }
  try {
    const arr = JSON.parse(stdout.slice(idx));
    return Array.isArray(arr) ? (arr as AgentInfo[]) : [];
  } catch {
    return [];
  }
}

export function runnerMissing(err: unknown): boolean {
  return /ENOENT|not found|spawn .* (failed|error)/i.test(String(msg(err)));
}

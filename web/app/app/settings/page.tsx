"use client";

/** Settings — API tokens (create shows the secret exactly once, list,
 * revoke), the per-agent install steps (the same commands SUPPORT.md
 * documents, i.e. the shipped runner), the extension download, and sign
 * out. Nothing here invents anything: token state is what the backend says. */
import { useState } from "react";
import useSWR from "swr";
import { api, type TokenItem } from "@/lib/api";
import {
  Badge, Btn, Card, Code, ErrorNote, PageHead, SectionTitle, SkeletonRows,
  inputCls, fmt,
} from "@/components/dashboard/ui";
/* Same constants the landing page's Download section bakes in at package
 * time (scripts/copy-vsix.sh) — one source of truth for version+file. */
import {
  VSIX_RELEASE_URL, VSIX_SHA256, VSIX_SIZE, VSIX_VERSION,
} from "@/components/Download";

/** Install steps per agent — exactly what deadend-runner / deadend-mcp do
 * (see SUPPORT.md in the repo for the doc links behind each row). */
const AGENTS = [
  { name: "Claude Code", runner: "--agent claude-code", mcp: ".mcp.json (JSON, mcpServers)", file: "CLAUDE.md" },
  { name: "Codex", runner: "--agent codex", mcp: ".codex/config.toml ([mcp_servers.deadend])", file: "AGENTS.md" },
  { name: "OpenCode", runner: "--agent opencode", mcp: "opencode.json (mcp)", file: "AGENTS.md" },
  { name: "Pi", runner: "--agent pi", mcp: ".pi/mcp.json", file: "AGENTS.md" },
  { name: "Antigravity CLI", runner: "--agent antigravity", mcp: ".agents/mcp_config.json", file: "AGENTS.md" },
  { name: "Copilot CLI", runner: "--agent copilot-cli", mcp: ".mcp.json", file: "AGENTS.md" },
] as const;

export default function SettingsPage() {
  const { data: tokens, error, isLoading, mutate } =
    useSWR<TokenItem[], Error>("tokens", api.tokens);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ token: string } | null>(null);
  const [msg, setMsg] = useState("");

  async function create() {
    setBusy(true); setMsg("");
    try {
      const r = await api.createToken(label.trim());
      setFresh({ token: r.token });
      setLabel("");
      mutate();
    } catch (ex) { setMsg(ex instanceof Error ? ex.message : "failed"); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    await api.revokeToken(id);
    mutate();
  }

  const active = (tokens ?? []).filter((t) => !t.revoked);

  return (
    <div className="space-y-8">
      <PageHead title="Settings" sub="Tokens for the runner and MCP server, how each agent connects, and the editor extension." />
      <ErrorNote error={error} />

      {/* tokens */}
      <section>
        <SectionTitle right={<span className="text-tiny text-text-muted">{active.length} active</span>}>
          API tokens
        </SectionTitle>

        {fresh && (
          <Card className="border-brand-success/40 p-4 mb-3">
            <div className="text-small text-brand-success mb-2">
              Copy this token now — it is shown once and never again.
            </div>
            <Code>{fresh.token}</Code>
            <div className="mt-2 flex gap-2">
              <Btn onClick={() => { navigator.clipboard?.writeText(fresh.token); setMsg("Copied."); }}>
                Copy
              </Btn>
              <Btn onClick={() => setFresh(null)}>I&apos;ve saved it</Btn>
            </div>
          </Card>
        )}

        <Card className="px-4 py-4 mb-3">
          <div className="flex flex-wrap gap-2 items-end">
            <label className="block flex-1 min-w-[12rem]">
              <span className="block text-tiny text-text-muted mb-1">label</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="laptop runner" className={inputCls} />
            </label>
            <Btn variant="fill" onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create token"}
            </Btn>
          </div>
          {msg && <p role="status" className="text-tiny text-text-secondary mt-2">{msg}</p>}
        </Card>

        <Card className="divide-y divide-line-900">
          {isLoading && <div className="px-4 py-3"><SkeletonRows n={2} h="h-8" /></div>}
          {(tokens ?? []).map((t) => (
            <div key={t.token_id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="text-small text-text-secondary">{t.label || "unlabelled"}</span>
              <span className="text-tiny text-text-muted font-mono">
                created {fmt.dt(t.created_at)}
              </span>
              <span className="text-tiny text-text-muted font-mono">
                last used {fmt.ago(t.last_used_at) ?? "never"}
              </span>
              {t.revoked
                ? <Badge>revoked</Badge>
                : <Btn variant="danger" onClick={() => revoke(t.token_id)}>Revoke</Btn>}
            </div>
          ))}
          {!isLoading && !(tokens ?? []).length && (
            <p className="px-4 py-5 text-small text-text-muted">
              No tokens yet. The device flow in the extension creates one when you
              approve it; you can also create one here for the runner.
            </p>
          )}
        </Card>
      </section>

      {/* extension */}
      <section>
        <SectionTitle>VS Code extension</SectionTitle>
        <Card className="px-4 py-4 flex flex-wrap items-center gap-4">
          <div className="min-w-0">
            <div className="text-small text-text-primary">DeadEnd extension v{VSIX_VERSION}</div>
            <p className="text-tiny text-text-muted mt-0.5">
              Run agents from the editor, watch steps live, accept or revert.
            </p>
            <p className="text-tiny text-text-muted font-mono mt-0.5">
              {VSIX_SIZE} · sha256 {VSIX_SHA256.slice(0, 16)}…
            </p>
          </div>
          <a href={VSIX_RELEASE_URL} download className="pill-fill px-4 py-1.5 text-small font-medium ml-auto">
            Download .vsix
          </a>
        </Card>
      </section>

      {/* agents */}
      <section>
        <SectionTitle>Connected agents</SectionTitle>
        <Card className="divide-y divide-line-900">
          {AGENTS.map((a) => (
            <div key={a.name} className="px-4 py-3.5">
              <div className="text-small text-text-primary">{a.name}</div>
              <dl className="mt-1.5 space-y-1 text-tiny">
                <Step k="runner" v={`deadend-runner run <repo> <task> ${a.runner}`} />
                <Step k="MCP" v={`deadend-runner mcp-config ${a.runner} → ${a.mcp}`} />
                <Step k="instruction file" v={a.file} />
                <Step k="capture" v={`entire enable --yes ${a.runner}`} />
              </dl>
            </div>
          ))}
        </Card>
        <p className="text-tiny text-text-muted mt-2">
          All six are shipped adapters — the runner retrieves context, drives the
          agent headless and records the run with its own telemetry.
        </p>
      </section>

      {/* session */}
      <section>
        <SectionTitle>Session</SectionTitle>
        <Card className="px-4 py-4 flex items-center justify-between">
          <p className="text-small text-text-muted">
            Signing out clears the session cookie on this device.
          </p>
          <a href="/signout" className="pill-outline px-4 py-1.5 text-small">Sign out</a>
        </Card>
      </section>
    </div>
  );
}

function Step({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <dt className="text-text-muted w-28 shrink-0">{k}</dt>
      <dd className="font-mono text-text-secondary break-all">{v}</dd>
    </div>
  );
}

"use client";

/** /app — protected dashboard. Server-side 401 guard via useMe (redirect
 * to /login). First-time users get onboarding: accept a pending invite,
 * create a team, or continue solo (auto personal team is created by the
 * client via POST /teams, then set active). */
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { api, UnauthorizedError } from "@/lib/api";
import { useMe } from "@/lib/useApi";
import { DeadEndMark } from "@/components/Nav";
import type { Overview, InviteItem, TokenItem, TeamSettings } from "@/lib/api";

export default function AppPage() {
  const { me, loading, unauthorized } = useMe({ redirectOn401: "/login" });
  const [activeTeam, setActiveTeam] = useState<string>("");
  const team = activeTeam || me?.teams[0]?.team_id || "";

  return (
    <main className="min-h-screen bg-ink-950">
      <header className="border-b border-line-900">
        <div className="mx-auto max-w-6xl px-6 h-nav flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <DeadEndMark /> DeadEnd
          </Link>
          <div className="flex items-center gap-4">
            {me && <span className="text-small text-text-secondary">{me.login}</span>}
            <button onClick={() => { location.href = "/signout"; }}
              className="pill-outline text-small px-3 py-1">Sign out</button>
          </div>
        </div>
      </header>

      {loading && <p className="p-10 text-text-muted text-small">loading…</p>}
      {unauthorized && null}
      {me && (
        team || me.teams.length
          ? <Dashboard teamId={team} me={me} setActiveTeam={setActiveTeam} />
          : <Onboarding meId={me.id} onTeam={(id) => setActiveTeam(id)} />
      )}
    </main>
  );
}

/* ------------------------------------------------------------- onboarding */
function Onboarding({ meId, onTeam }: { meId: string; onTeam: (teamId: string) => void }) {
  const { data: invites, mutate: refetchInvites } = useSWR<InviteItem[], Error>("invites", api.invites, { shouldRetryOnError: false });
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function accept(id: string) {
    setBusy(true);
    try {
      const r = await api.acceptInvite(id);
      if (r?.status === "accepted") { await refetchInvites(); onTeam(id); }
    } finally { setBusy(false); }
  }
  async function createTeam(solo: boolean) {
    setBusy(true);
    try {
      const name = solo ? `solo-${meId.slice(0, 6)}` : prompt("Team name") || "";
      if (!name) return;
      const r = await fetch("/api/teams", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }) });
      if (r.ok) onTeam((await r.json()).team_id);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-20 text-center">
      <h1 className="text-h2 font-bold mb-3">Welcome to DeadEnd</h1>
      <p className="text-body text-text-secondary mb-10">
        Join a team, create one, or work solo (we&apos;ll set up a personal team).
      </p>
      <div className="grid gap-4">
        {(invites ?? []).length > 0 && (invites ?? []).map((inv) => (
          <div key={inv.invite_id} className="border border-line-800 rounded-card bg-ink-900 p-5 flex items-center justify-between">
            <div className="text-left">
              <div className="text-body font-medium">Invite to {inv.team_name}</div>
              <div className="text-tiny text-text-muted">as {inv.role}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => accept(inv.invite_id)} disabled={busy}
                className="pill-fill px-4 py-1.5 text-small">Accept</button>
              <button onClick={async () => { await api.declineInvite(inv.invite_id); refetchInvites(); }}
                className="pill-outline px-4 py-1.5 text-small">Decline</button>
            </div>
          </div>
        ))}
        <button onClick={() => createTeam(false)} disabled={busy}
          className="border border-line-800 rounded-card bg-ink-900 p-5 text-body font-medium hover:border-line-700">
          Create a team
        </button>
        <button onClick={() => createTeam(true)} disabled={busy}
          className="border border-line-800 rounded-card bg-ink-850 p-5 text-small text-text-secondary hover:border-line-700">
          Continue solo — create my personal team
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- panels */
function Dashboard({ teamId, me, setActiveTeam }: {
  teamId: string; me: { login: string; teams: { team_id: string; role: string }[] };
  setActiveTeam: (id: string) => void;
}) {
  const { data: overview, error: ovErr } = useSWR<Overview, Error>
    (["overview", teamId], ([, t]) => api.overview() /* overview is teamless server-side; team filter applied client-side by recent runs */);
  const { data: settings } = useSWR<TeamSettings, Error>
    (teamId ? ["settings", teamId] : null, ([, t]) => api.teamSettings(t as string));
  const { data: tokens, mutate: refetchTokens } = useSWR<TokenItem[], Error>("tokens", api.tokens);
  const [savingShare, setSavingShare] = useState(false);

  async function setShare(v: TeamSettings["default_share"]) {
    if (!teamId) return;
    setSavingShare(true);
    try { await api.setTeamShare(teamId, v); } finally { setSavingShare(false); }
  }
  const runTokens = overview?.runs?.total_tokens ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 space-y-10">
      {/* team switch + share policy */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h3 font-bold">Overview</h2>
          <div className="flex items-center gap-2">
            {me.teams.length > 1 && (
              <select value={teamId} onChange={(e) => setActiveTeam(e.target.value)}
                className="bg-ink-800 border border-line-800 rounded-chip text-small p-1.5">
                {me.teams.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_id}</option>)}
              </select>
            )}
            <span className="text-tiny text-text-muted">sharing</span>
            <select value={settings?.default_share ?? "off"} disabled={savingShare}
              onChange={(e) => setShare(e.target.value as TeamSettings["default_share"])}
              className="bg-ink-800 border border-line-800 rounded-chip text-small p-1.5">
              <option value="off">off</option>
              <option value="team">team</option>
              <option value="global-after-approval">global-after-approval</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat k="private entries" v={overview?.entries?.private} />
          <Stat k="verified" v={overview?.entries?.verified} />
          <Stat k="runs" v={overview?.runs?.total} />
          <Stat k="success rate"
            v={overview?.runs?.success_rate != null
              ? `${Math.round(overview.runs.success_rate * 100)}%`
              : (overview?.runs && overview.runs.total === 0 ? null : undefined)} />
          <Stat k="tokens" v={runTokens || null} />
          <Stat k="time saved (est.)"
            v={overview?.runs?.time_saved_seconds != null
              ? `${Math.round(overview.runs.time_saved_seconds / 60)} min`
              : undefined} />
          <Stat k="global reused" v={overview?.entries?.global_reused} />
          <Stat k="api tokens" v={tokens?.filter((t) => !t.revoked).length || 0} />
        </div>
        {ovErr && !(ovErr instanceof UnauthorizedError) && (
          <p className="text-tiny text-brand-danger mt-2">{ovErr.message}</p>
        )}
      </section>

      {/* recent runs */}
      <section>
        <h2 className="text-h3 font-bold mb-4">Recent runs</h2>
        <div className="border border-line-800 rounded-card bg-ink-900 divide-y divide-line-900">
          {(overview?.recent_runs ?? []).map((r) => (
            <div key={r.run_id} className="px-4 py-2.5 flex items-center gap-3 text-small">
              <span className={`w-1.5 h-1.5 rounded-full ${r.status === "success" ? "bg-brand-success" : r.status === "running" ? "bg-amber-300" : "bg-brand-danger"}`} />
              <code className="text-tiny font-mono text-text-muted">{r.run_id.slice(0, 8)}</code>
              <span className="text-text-secondary">{r.task}</span>
              <span className="ml-auto text-tiny text-text-muted font-mono">{r.agent}</span>
            </div>
          ))}
          {!overview?.recent_runs?.length && (
            <div className="px-4 py-6 text-small text-text-muted">No runs yet — install the extension or run the runner.</div>
          )}
        </div>
      </section>

      {/* tokens */}
      <section>
        <h2 className="text-h3 font-bold mb-4">API tokens</h2>
        <div className="border border-line-800 rounded-card bg-ink-900 divide-y divide-line-900">
          {(tokens ?? []).map((t) => (
            <div key={t.token_id} className="px-4 py-2.5 flex items-center gap-3 text-small">
              <span className="text-text-secondary">{t.label || "token"}</span>
              <span className="text-tiny text-text-muted font-mono">
                {new Date(t.created_at).toLocaleDateString()}</span>
              {t.revoked ? <span className="text-tiny text-text-muted">revoked</span> : (
                <button onClick={async () => { await api.revokeToken(t.token_id); refetchTokens(); }}
                  className="ml-auto pill-outline text-tiny px-3 py-0.5">revoke</button>
              )}
            </div>
          ))}
          {!tokens?.length && (
            <div className="px-4 py-6 text-small text-text-muted">
              No tokens yet — approve a device in the extension sign-in flow.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ k, v }: { k: string; v?: number | string | null }) {
  return (
    <div className="border border-line-800 rounded-card bg-ink-900 p-4">
      <div className="text-tiny uppercase tracking-widest text-text-muted">{k}</div>
      <div className="text-h3 font-bold mt-1">
        {v === null ? <span className="text-text-muted text-body">no data yet</span>
          : v === undefined ? <span className="text-text-muted text-body">—</span>
          : v}
      </div>
    </div>
  );
}

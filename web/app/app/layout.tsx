"use client";

/** /app shell: auth guard (redirect to /login), first-run onboarding when
 * the user has no team yet, then sidebar + topbar around the routed page.
 * Every page renders inside an ErrorBoundary; data comes from /lib/api. */
import { useState, type FormEvent, type ReactNode } from "react";
import useSWR from "swr";
import { api, type InviteItem, type MeResp } from "@/lib/api";
import { useMe } from "@/lib/useApi";
import { TeamProvider } from "@/lib/team";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { Btn, ErrorBoundary, Field, Skeleton, inputCls } from "@/components/dashboard/ui";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { me, loading, unauthorized } = useMe({ redirectOn401: "/login" });
  const [menuOpen, setMenuOpen] = useState(false);

  if (loading || unauthorized || !me) return <Boot />;

  return (
    <TeamGate me={me}>
      <Shell>{children}</Shell>
    </TeamGate>
  );
}

/* ------------------------------------------------------------- boot */
function Boot() {
  return (
    <div className="min-h-screen bg-ink-950 flex" aria-busy="true">
      <div className="hidden md:block w-56 border-r border-line-900 p-3 space-y-2">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
      <div className="flex-1 p-6 space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- team gate */
function TeamGate({ me, children }: { me: MeResp; children: ReactNode }) {
  // no team yet → onboarding; otherwise the provider loads GET /teams
  if (!me.teams.length) return <Onboarding me={me} />;
  return <TeamProvider me={me}>{children}</TeamProvider>;
}

/* -------------------------------------------------------- onboarding */
function Onboarding({ me }: { me: MeResp }) {
  const { data: invites, mutate: refetchInvites } = useSWR<InviteItem[], Error>(
    "invites", api.invites, { shouldRetryOnError: false });
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string>("");

  async function refresh() {
    // reload /auth/me so the layout re-evaluates the team gate
    await refetchInvites();
    location.reload();
  }

  async function accept(id: string) {
    setBusy(true); setNote("");
    try { await api.acceptInvite(id); await refresh(); }
    catch (e) { setNote(e instanceof Error ? e.message : "failed"); }
    finally { setBusy(false); }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setNote("");
    try { await api.createTeam(name.trim()); await refresh(); }
    catch (ex) { setNote(ex instanceof Error ? ex.message : "failed"); }
    finally { setBusy(false); }
  }

  async function solo() {
    setBusy(true); setNote("");
    try { await api.createTeam(`solo-${me.login}`.slice(0, 128)); await refresh(); }
    catch (ex) { setNote(ex instanceof Error ? ex.message : "failed"); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-ink-950 flex items-center justify-center px-6">
      <div className="w-full max-w-xl">
        <h1 className="text-h3 font-bold mb-1">Welcome to DeadEnd, {me.login}</h1>
        <p className="text-small text-text-muted mb-6">
          Memories, runs and sharing all live inside a team. Join one you&apos;re
          invited to, create your own, or continue solo.
        </p>

        {(invites ?? []).length > 0 && (
          <div className="space-y-2 mb-4">
            {(invites ?? []).map((inv) => (
              <div key={inv.invite_id}
                className="border border-line-800 rounded-card bg-ink-900 p-4 flex items-center justify-between">
                <div>
                  <div className="text-small font-medium">Invite to {inv.team_name}</div>
                  <div className="text-tiny text-text-muted">as {inv.role}</div>
                </div>
                <div className="flex gap-2">
                  <Btn variant="fill" disabled={busy} onClick={() => accept(inv.invite_id)}>
                    Accept
                  </Btn>
                  <Btn disabled={busy}
                    onClick={async () => { await api.declineInvite(inv.invite_id); refetchInvites(); }}>
                    Decline
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={create} className="border border-line-800 rounded-card bg-ink-900 p-4 mb-3">
          <Field label="Create a team">
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)}
                placeholder="team name" className={inputCls} />
              <Btn variant="fill" type="submit" disabled={busy || !name.trim()}>Create</Btn>
            </div>
          </Field>
        </form>

        <button onClick={solo} disabled={busy}
          className="w-full border border-line-800 rounded-card bg-ink-900 px-4 py-3 text-small text-text-secondary hover:border-line-700 disabled:opacity-50">
          Continue solo — create <span className="font-mono">solo-{me.login}</span>
        </button>

        {note && <p role="alert" className="text-small text-brand-danger mt-3">{note}</p>}
      </div>
    </main>
  );
}

/* -------------------------------------------------------------- shell */
function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-screen bg-ink-950 flex">
      <a href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:p-2
                   focus:bg-ink-800 focus:rounded-chip focus:text-small">
        Skip to content
      </a>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main id="main" className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-6 py-6">
          <ErrorBoundary label="Page">{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

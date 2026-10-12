"use client";

/** Getting started (in-app) — the live version of /docs/getting-started.
 * Every row is marked from real data: GET /me/setup-status (active tokens,
 * teams, and whether any run recorded a neatlogs trace id / an Entire
 * checkpoint id) plus GET /me/overview (runs, entries). null stays
 * pending with honest copy — nothing is invented, nothing is faked. */
import Link from "next/link";
import useSWR from "swr";
import { api, type Overview, type SetupStatusResp } from "@/lib/api";
import { useTeam } from "@/lib/team";
import { Copyable } from "@/components/GettingStarted";
import {
  Badge, Btn, Card, ErrorNote, PageHead, SectionTitle, SkeletonRows,
} from "@/components/dashboard/ui";

type Row = {
  id: string;
  status: "done" | "pending" | "warn";
  title: string;
  detail: string;
  href?: string;
  linkLabel?: string;
  cmd?: string;
};

export default function GettingStartedAppPage() {
  const { me } = useTeam();
  const { data: st, error: stErr, isLoading: stLoad, mutate: recheckSt } =
    useSWR<SetupStatusResp, Error>("setup-status", api.setupStatus,
      { shouldRetryOnError: false });
  const { data: ov, error: ovErr, isLoading: ovLoad, mutate: recheckOv } =
    useSWR<Overview, Error>("overview", api.overview,
      { shouldRetryOnError: false });

  const runs = ov?.runs ?? null;
  const entries = ov?.entries ?? null;

  const rows: Row[] = [
    {
      id: "signin",
      status: me ? "done" : "pending",
      title: "Signed in with GitHub",
      detail: me
        ? `Signed in as ${me.login}.`
        : "Sign in on the website first.",
    },
    {
      id: "ext",
      status: (st?.tokens_count ?? 0) > 0 ? "done" : "pending",
      title: "VS Code extension connected",
      detail: st && st.tokens_count > 0
        ? `${st.tokens_count} active API token${st.tokens_count === 1 ? "" : "s"} — ` +
          "approving a device code in the browser creates one."
        : "Install the .vsix and approve the device code in the browser — that creates your first token.",
      href: "/docs/getting-started#step-2",
      linkLabel: "Guide",
    },
    {
      id: "team",
      status: (st?.teams.length ?? 0) > 0 ? "done" : "pending",
      title: "Team chosen",
      detail: st && st.teams.length
        ? `${st.teams.length} team${st.teams.length === 1 ? "" : "s"} — ` +
          "switch from the top bar, or create another under Teams."
        : "Create or join a team — the extension needs one to scope its token to.",
      href: "/app/teams",
      linkLabel: "Teams",
    },
    {
      id: "runner",
      status: runs?.total ? "done" : "pending",
      title: "Runner installed on your machine",
      detail: runs?.total
        ? "Runs have been recorded, so the runner is installed and working."
        : "The extension’s Install runner button runs this (or run it yourself):",
      cmd: runs?.total ? undefined
        : "pipx install git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner",
      href: runs?.total ? undefined : "/docs/getting-started#step-5",
      linkLabel: "Guide",
    },
    {
      id: "neatlogs",
      status: st?.neatlogs_recorded === true ? "done"
        : st?.neatlogs_recorded === false ? "warn" : "pending",
      title: "neatlogs recording",
      detail: st?.neatlogs_recorded === true
        ? "A recorded run carries a neatlogs trace id."
        : st?.neatlogs_recorded === false
        ? "Runs were recorded but no trace id — set NEATLOGS_API_KEY, then run once more."
        : "No runs recorded yet. Get a project key from neatlogs and set NEATLOGS_API_KEY.",
      cmd: st?.neatlogs_recorded === true ? undefined
        : "export NEATLOGS_API_KEY=<your neatlogs project key>",
      href: "/docs/getting-started#step-7",
      linkLabel: "Guide",
    },
    {
      id: "entire",
      status: st?.entire_recorded === true ? "done"
        : st?.entire_recorded === false ? "warn" : "pending",
      title: "Entire enabled in your repo",
      detail: st?.entire_recorded === true
        ? "A recorded run carries an Entire checkpoint id."
        : st?.entire_recorded === false
        ? "Runs recorded but no checkpoint id — run `entire enable` in the repo, then run once more."
        : "No runs yet. After your first run, enable Entire in the repo to start checkpoints.",
      cmd: st?.entire_recorded === true ? undefined
        : "entire enable --agent claude-code",
      href: "/docs/getting-started#step-8",
      linkLabel: "Guide",
    },
    {
      id: "run",
      status: runs?.total ? "done" : "pending",
      title: "First run recorded",
      detail: runs?.total
        ? `${runs.total} run${runs.total === 1 ? "" : "s"} recorded across your teams.`
        : "Run a task from the extension with memory on — the timeline shows real phases.",
      href: "/app/runs",
      linkLabel: "Runs",
    },
    {
      id: "memory",
      status: entries?.private ? "done" : "pending",
      title: "First memory stored",
      detail: entries?.private
        ? `${entries.private} private memor${entries.private === 1 ? "y" : "ies"}.`
        : "A failed attempt with a verified fix becomes a memory — save one from a run’s result card.",
      href: "/app/memories",
      linkLabel: "Memories",
    },
    {
      id: "share",
      status: entries?.global_reused ? "done" : "pending",
      title: "Shared to team or published to global",
      detail: entries?.global_reused
        ? `${entries.global_reused} global entr${entries.global_reused === 1 ? "y" : "ies"} published (redacted, approved by you).`
        : "Share a fix with your team, or publish a redacted one to global — you approve the exact diff.",
      href: "/app/sharing",
      linkLabel: "Sharing",
    },
  ];

  const doneCount = rows.filter((r) => r.status === "done").length;

  return (
    <div className="space-y-8">
      <PageHead
        title="Getting started"
        sub="The same steps as the public guide, checked against your real data — tokens, teams, recorded runs and capture status. Nothing here is inferred beyond what the backend has actually seen."
        actions={
          <div className="flex items-center gap-2">
            <Btn onClick={() => { void recheckSt(); void recheckOv(); }}>
              Re-check
            </Btn>
            <a href="/docs/getting-started"
              className="pill-outline px-4 py-1.5 text-small">
              Full guide →
            </a>
          </div>
        }
      />

      <ErrorNote error={stErr ?? ovErr} />

      {(stLoad || ovLoad) && <SkeletonRows n={6} />}

      {(st || ov) && (
        <section>
          <SectionTitle right={
            <span className="text-tiny text-text-muted font-mono">
              {doneCount} of {rows.length} done
            </span>
          }>
            Setup checklist
          </SectionTitle>
          <Card className="divide-y divide-line-900">
            {rows.map((r) => (
              <div key={r.id} className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <span className={`mt-1 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    r.status === "done"
                      ? "border-brand-success text-brand-success"
                      : r.status === "warn"
                      ? "border-amber-400/60 text-amber-300"
                      : "border-line-700"}`}
                    aria-hidden>
                    {r.status === "done" && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    )}
                    {r.status === "warn" && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M5 2v4M5 8h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-small font-medium flex items-center gap-2 flex-wrap">
                      {r.title}
                      <Badge tone={r.status === "done" ? "good" : r.status === "warn" ? "warn" : "muted"}>
                        {r.status === "done" ? "done" : r.status === "warn" ? "needs a step" : "pending"}
                      </Badge>
                    </div>
                    <p className="text-tiny text-text-muted mt-0.5">{r.detail}</p>
                    {r.cmd && <Copyable text={r.cmd} />}
                  </div>
                  {r.href && (
                    <Link href={r.href}
                      className="text-tiny text-text-secondary hover:text-text-primary shrink-0">
                      {r.linkLabel ?? "open"} →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </Card>
          <p className="text-tiny text-text-muted mt-2">
            neatlogs and Entire rows come from GET /me/setup-status: they flip
            once a recorded run actually carries a trace id or checkpoint id —
            a key alone is not counted.
          </p>
        </section>
      )}
    </div>
  );
}

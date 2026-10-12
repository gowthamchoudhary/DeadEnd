"use client";

/** Overview — every number comes from GET /me/overview. Anything the
 * backend reports as null renders as "no data yet": nothing is invented,
 * no placeholder statistics. */
import Link from "next/link";
import useSWR from "swr";
import { api, type Overview } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Card, Empty, ErrorNote, PageHead, SectionTitle, Skeleton, SkeletonRows,
  StatusDot, fmt,
} from "@/components/dashboard/ui";

export default function OverviewPage() {
  const { teamId } = useTeam();
  const { data: ov, error, isLoading } = useSWR<Overview, Error>(
    "overview", api.overview, { refreshInterval: 20000 });

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <SkeletonRows n={3} />
      </div>
    );
  }

  const entries = ov?.entries ?? null;
  const runs = ov?.runs ?? null;
  const nothingYet = !entries && !runs;

  return (
    <div className="space-y-8">
      <PageHead title="Overview" sub="Counts reported by the backend. Null means the data does not exist yet — it is never filled in." />

      <ErrorNote error={error} />

      {nothingYet && !error && (
        <Empty
          title="Nothing recorded yet"
          body="Once your first agent run records a failure, or the extension captures a memory, these cards fill in with real numbers."
          cta={{ label: "How to get started", href: "/app/getting-started" }}
        />
      )}

      {/* stat cards — null → "no data yet" */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="private entries" value={entries ? fmt.num(entries.private) : null} />
        <Stat label="global entries" value={entries ? fmt.num(entries.global_reused) : null} />
        <Stat label="verified" value={entries ? fmt.num(entries.verified) : null} />
        <Stat label="runs" value={runs ? fmt.num(runs.total) : null} />
        <Stat label="success rate" value={fmt.pct(runs?.success_rate ?? null)} />
        <Stat label="tokens used" value={fmt.bytes(runs?.total_tokens ?? null)} />
        <Stat label="time saved (real reuse)" value={fmt.dur(runs?.time_saved_seconds ?? null)} />
        <Stat label="team" value={teamId ? "active" : null} hint={teamId ? undefined : "no team"} />
      </div>

      {runs?.note && <p className="text-tiny text-text-muted -mt-4">{runs.note}</p>}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* repeated failures */}
        <section>
          <SectionTitle right={<Link href="/app/memories" className="text-tiny text-text-muted hover:text-text-secondary">all memories →</Link>}>
            Repeated failures
          </SectionTitle>
          <Card className="divide-y divide-line-900">
            {(ov?.repeated_failures ?? []).map((f) => (
              <Link key={f.signature_hash} href="/app/memories"
                className="flex items-center gap-3 px-4 py-3 hover:bg-ink-850 transition-colors">
                <span className="font-mono text-tiny text-text-muted w-8 shrink-0">×{f.count}</span>
                <span className="text-small text-text-secondary truncate">{f.title}</span>
                <span className="ml-auto font-mono text-tiny text-text-muted shrink-0">
                  {f.signature_hash.slice(0, 8)}
                </span>
              </Link>
            ))}
            {ov && !ov.repeated_failures?.length && (
              <p className="px-4 py-6 text-small text-text-muted">
                No signature has failed twice yet — repetition is what this is for.
              </p>
            )}
          </Card>
        </section>

        {/* recent runs */}
        <section>
          <SectionTitle right={<Link href="/app/runs" className="text-tiny text-text-muted hover:text-text-secondary">all runs →</Link>}>
            Recent runs
          </SectionTitle>
          <Card className="divide-y divide-line-900">
            {(ov?.recent_runs ?? []).map((r) => (
              <Link key={r.run_id} href={`/app/runs/${r.run_id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-ink-850 transition-colors">
                <StatusDot status={r.status} />
                <span className="text-small text-text-secondary truncate">{r.task}</span>
                <span className="ml-auto font-mono text-tiny text-text-muted shrink-0">{r.agent}</span>
              </Link>
            ))}
            {ov && !ov.recent_runs?.length && (
              <p className="px-4 py-6 text-small text-text-muted">
                No runs yet — start one with the runner or the VS Code extension.
              </p>
            )}
          </Card>
        </section>
      </div>

      {/* how to get started — the live checklist lives on its own page */}
      <section id="get-started">
        <SectionTitle>How to get started</SectionTitle>
        <Card className="px-4 py-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="text-small text-text-primary">Follow the live setup checklist</div>
            <p className="text-tiny text-text-muted mt-0.5">
              The same steps as the public guide, with each row marked done
              from your real data — tokens, teams, recorded runs and capture
              status.
            </p>
          </div>
          <Link href="/app/getting-started"
            className="pill-fill ml-auto px-4 py-1.5 text-small font-medium">
            Open checklist
          </Link>
        </Card>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
  return (
    <div className="border border-line-800 rounded-card bg-ink-900 p-4">
      <div className="text-tiny uppercase tracking-widest text-text-muted">{label}</div>
      <div className="mt-1.5 text-h3 font-bold">
        {value ?? <span className="text-body font-normal text-text-muted">no data yet</span>}
      </div>
      {hint && <div className="text-tiny text-text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

"use client";

/** Runs history — GET /runs?team_id= (project filter applied from the top
 * bar). Columns are exactly what the backend records; "context used" comes
 * from the runner's own summary flag, not an estimate. */
import Link from "next/link";
import useSWR from "swr";
import { api, type RunView } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Badge, Card, Empty, ErrorNote, PageHead, SkeletonRows, StatusDot, fmt,
} from "@/components/dashboard/ui";

export default function RunsPage() {
  const { teamId, projectFilter, projects, projectById } = useTeam();
  const { data: runs, error, isLoading } = useSWR<RunView[], Error>(
    teamId ? ["runs", teamId] : null, () => api.runs(teamId));

  const rows = (runs ?? []).filter((r) => !projectFilter || r.project_id === projectFilter);

  return (
    <div className="space-y-5">
      <PageHead title="Runs" sub="Every agent run recorded for this team, newest first (last 100)." />
      <ErrorNote error={error} />
      {isLoading && <SkeletonRows n={6} h="h-12" />}

      {!isLoading && !error && rows.length === 0 && (
        <Empty
          title={projectFilter ? "No runs for this project" : "No runs yet"}
          body="Runs appear here when deadend-runner or the VS Code extension records one — with the agent, tokens and duration the agent itself reported."
          cta={{ label: "Connect the extension", href: "/app/settings" }}
        />
      )}

      {rows.length > 0 && (
        <Card className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[46rem]">
            <thead>
              <tr className="border-b border-line-800 text-tiny uppercase tracking-widest text-text-muted">
                <th className="px-4 py-2.5 font-normal">task</th>
                <th className="px-3 py-2.5 font-normal">agent</th>
                <th className="px-3 py-2.5 font-normal">project</th>
                <th className="px-3 py-2.5 font-normal">status</th>
                <th className="px-3 py-2.5 font-normal text-right">duration</th>
                <th className="px-3 py-2.5 font-normal text-right">tokens</th>
                <th className="px-3 py-2.5 font-normal">context</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-900">
              {rows.map((r) => (
                <tr key={r.run_id} className="hover:bg-ink-850 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/app/runs/${r.run_id}`} className="text-small text-text-primary hover:underline block max-w-xs truncate">
                      {r.task}
                    </Link>
                    <span className="font-mono text-tiny text-text-muted">{r.run_id.slice(0, 8)}</span>
                  </td>
                  <td className="px-3 py-2.5 text-small text-text-secondary whitespace-nowrap">{r.agent}</td>
                  <td className="px-3 py-2.5 text-small text-text-muted whitespace-nowrap">{projectById(r.project_id)}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-2 text-small text-text-secondary">
                      <StatusDot status={r.status} />{r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-small text-text-secondary whitespace-nowrap">
                    {fmt.dur(r.duration) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-small text-text-secondary whitespace-nowrap">
                    {fmt.bytes(r.tokens_in != null || r.tokens_out != null
                      ? (r.tokens_in ?? 0) + (r.tokens_out ?? 0) : null) ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.context_used
                      ? <Badge tone="good">used</Badge>
                      : <Badge>{r.status === "running" ? "pending" : "none"}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {projects.length > 0 && (
        <p className="text-tiny text-text-muted">
          {projects.length} project{projects.length === 1 ? "" : "s"} in this team ·
          {runs?.length ?? 0} run{(runs?.length ?? 0) === 1 ? "" : "s"} shown
        </p>
      )}
    </div>
  );
}

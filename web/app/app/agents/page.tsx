"use client";

/** Agents — GET /stats/agents: per-agent run aggregates from the runner's
 * own telemetry, split by whether DeadEnd context was applied. The split is
 * the runner's context_used flag, never inferred. Empty until runs exist. */
import useSWR from "swr";
import { api, type AgentStats } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Bars, Card, Empty, ErrorNote, PageHead, SectionTitle, SkeletonRows, fmt,
} from "@/components/dashboard/ui";

export default function AgentsPage() {
  const { teamId } = useTeam();
  const { data, error, isLoading } = useSWR<AgentStats, Error>(
    teamId ? ["stats/agents", teamId] : null, () => api.statsAgents(teamId));

  const agents = Object.entries(data?.agents ?? {});

  return (
    <div className="space-y-6">
      <PageHead
        title="Agents"
        sub="Per-agent totals for this team, and the same numbers split by whether retrieved DeadEnd context was actually used."
      />
      <ErrorNote error={error} />
      {isLoading && <SkeletonRows n={3} h="h-16" />}

      {!isLoading && !error && agents.length === 0 && (
        <Empty
          title="No agent has run yet"
          body="Once deadend-runner or the extension records runs, this page compares success rate, tokens and duration per agent — with and without retrieved context."
          cta={{ label: "Install steps", href: "/app/settings" }}
        />
      )}

      {agents.length > 0 && (
        <>
          {/* comparison table */}
          <Card className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[40rem]">
              <thead>
                <tr className="border-b border-line-800 text-tiny uppercase tracking-widest text-text-muted">
                  <th className="px-4 py-2.5 font-normal">agent</th>
                  <th className="px-3 py-2.5 font-normal text-right">runs</th>
                  <th className="px-3 py-2.5 font-normal text-right">success rate</th>
                  <th className="px-3 py-2.5 font-normal text-right">avg tokens</th>
                  <th className="px-3 py-2.5 font-normal text-right">max tokens</th>
                  <th className="px-3 py-2.5 font-normal text-right">avg duration</th>
                  <th className="px-3 py-2.5 font-normal text-right">avg attempts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-900">
                {agents.map(([name, s]) => (
                  <tr key={name} className="hover:bg-ink-850 transition-colors">
                    <td className="px-4 py-3 text-small text-text-primary">{name}</td>
                    <td className="px-3 py-3 text-right font-mono text-small text-text-secondary">{s.all.runs}</td>
                    <td className="px-3 py-3 text-right font-mono text-small text-text-secondary">{fmt.pct(s.all.success_rate) ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-small text-text-secondary">{fmt.bytes(s.all.avg_tokens) ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-small text-text-secondary">{fmt.bytes(s.all.max_tokens) ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-small text-text-secondary">{fmt.dur(s.all.avg_duration_s) ?? "—"}</td>
                    <td className="px-3 py-3 text-right font-mono text-small text-text-secondary">{fmt.dec(s.all.avg_attempts) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* with vs without context */}
          <section>
            <SectionTitle>With context vs without context</SectionTitle>
            <div className="grid lg:grid-cols-2 gap-4">
              {agents.map(([name, s]) => (
                <Card key={name} className="p-4">
                  <div className="text-small font-medium mb-3">{name}</div>
                  <div className="text-tiny uppercase tracking-widest text-text-muted mb-2">success rate</div>
                  <Bars rows={[
                    { label: `with context (${s.with_context.runs})`, value: s.with_context.success_rate, display: fmt.pct(s.with_context.success_rate) ?? "—" },
                    { label: `without (${s.without_context.runs})`, value: s.without_context.success_rate, display: fmt.pct(s.without_context.success_rate) ?? "—" },
                  ]} />
                  <div className="text-tiny uppercase tracking-widest text-text-muted mt-4 mb-2">avg tokens</div>
                  <Bars rows={[
                    { label: `with context (${s.with_context.runs})`, value: s.with_context.avg_tokens, display: fmt.bytes(s.with_context.avg_tokens) ?? "—" },
                    { label: `without (${s.without_context.runs})`, value: s.without_context.avg_tokens, display: fmt.bytes(s.without_context.avg_tokens) ?? "—" },
                  ]} />
                  {s.with_context.runs === 0 && (
                    <p className="text-tiny text-text-muted mt-3">
                      No runs with retrieved context yet for this agent.
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

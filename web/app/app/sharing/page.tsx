"use client";

/** Sharing — the promotion queue from GET /contributions with a real
 * before/after diff viewer (the entry's current recipe vs the proposed
 * generalized one), Approve / Reject, the policy, and what is currently
 * shared with the team vs global, per project.
 *
 * Nothing becomes global without an explicit approve: POST /promote only
 * queues, and POST /promote/approve publishes. */
import { useState } from "react";
import useSWR from "swr";
import { api, type ContributionItem } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Badge, Btn, Card, Code, Empty, ErrorNote, PageHead, SectionTitle, Select,
  SkeletonRows,
} from "@/components/dashboard/ui";

const STATUS_TONE = {
  awaiting_approval: "warn", approved: "muted", rejected: "bad",
  published: "good", drafting: "muted",
} as const;

export default function SharingPage() {
  const { teamId, me, projects } = useTeam();
  const [filter, setFilter] = useState("");

  const { data: queue, error, isLoading, mutate } = useSWR<ContributionItem[], Error>(
    teamId ? ["contributions", teamId, filter] : null,
    () => api.contributions(teamId, filter || undefined));
  const { data: settings, mutate: refetchSettings } =
    useSWR(teamId ? ["settings", teamId] : null, () => api.teamSettings(teamId));
  const { data: priv } = useSWR(teamId ? ["entries", "private", teamId] : null,
    () => api.entries({ scope: "private", team_id: teamId, per_page: 100 }));
  const { data: glob } = useSWR("entries/global",
    () => api.entries({ scope: "global", per_page: 100 }));

  return (
    <div className="space-y-6">
      <PageHead
        title="Sharing"
        sub="Promotions wait here until someone approves the redacted diff. Nothing becomes global without that click."
      />

      <Card className="px-4 py-4 flex flex-wrap items-center gap-3">
        <span className="text-tiny uppercase tracking-widest text-text-muted">team policy</span>
        <Select aria-label="Team sharing policy" value={settings?.default_share ?? "off"}
          onChange={async (e) => {
            await api.setTeamShare(teamId, e.target.value as "off" | "team" | "global-after-approval");
            refetchSettings();
          }}>
          <option value="off">off</option>
          <option value="team">team</option>
          <option value="global-after-approval">global after approval</option>
        </Select>
        <Select aria-label="Filter by status" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">all statuses</option>
          <option value="awaiting_approval">awaiting approval</option>
          <option value="published">published</option>
          <option value="rejected">rejected</option>
        </Select>
      </Card>

      <ErrorNote error={error} />
      {isLoading && <SkeletonRows n={3} h="h-24" />}

      {!isLoading && !error && !(queue ?? []).length && (
        <Empty
          title={filter ? "Nothing with that status" : "The promotion queue is empty"}
          body="Open a verified private memory and choose Promote: the backend redacts it and queues the diff here for approval."
          cta={{ label: "Browse verified memories", href: "/app/memories" }}
        />
      )}

      <div className="space-y-3">
        {(queue ?? []).map((c) => (
          <ContributionCard key={c.contribution_id} c={c} meId={me.id}
            onMutated={() => mutate()} />
        ))}
      </div>

      {/* what is shared per project */}
      <section>
        <SectionTitle right={<span className="text-tiny text-text-muted">latest 100 each</span>}>
          What is shared, per project
        </SectionTitle>
        <Card className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-line-800 text-tiny uppercase tracking-widest text-text-muted">
                <th className="px-4 py-2.5 font-normal">project</th>
                <th className="px-3 py-2.5 font-normal text-right">team only</th>
                <th className="px-3 py-2.5 font-normal text-right">global</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-900">
              {projects.map((p) => {
                const t = (priv?.entries ?? []).filter((e) => e.project_id === p.project_id).length;
                const g = (glob?.entries ?? []).filter((e) => e.project_id === p.project_id).length;
                return (
                  <tr key={p.project_id}>
                    <td className="px-4 py-2.5 text-small text-text-secondary">{p.name}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-small">{t}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-small">{g}</td>
                  </tr>
                );
              })}
              {!projects.length && (
                <tr><td colSpan={3} className="px-4 py-4 text-small text-text-muted">
                  No projects in this team yet.
                </td></tr>
              )}
            </tbody>
          </table>
        </Card>
        {glob && (
          <p className="text-tiny text-text-muted mt-2">
            Global pool currently holds {glob.entries.length} memor{glob.entries.length === 1 ? "y" : "ies"} (latest 100 shown).
          </p>
        )}
      </section>
    </div>
  );
}

function ContributionCard({ c, meId, onMutated }: {
  c: ContributionItem; meId: string; onMutated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "approve" | "reject">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data: entry } = useSWR(open ? ["entry", c.entry_id] : null,
    () => api.entry(c.entry_id));

  const canApprove = c.user_id === meId && c.status === "awaiting_approval";
  const canReject = c.status === "awaiting_approval" || c.status === "drafting";

  async function approve() {
    setBusy("approve"); setMsg(null);
    try {
      await api.approveContribution(c.contribution_id);
      setMsg({ ok: true, text: "Published to the global pool." });
      onMutated();
    } catch (ex) { setMsg({ ok: false, text: ex instanceof Error ? ex.message : "failed" }); }
    finally { setBusy(""); }
  }

  async function reject() {
    setBusy("reject"); setMsg(null);
    try {
      await api.rejectContribution(c.contribution_id);
      setMsg({ ok: true, text: "Rejected — nothing was published." });
      onMutated();
    } catch (ex) { setMsg({ ok: false, text: ex instanceof Error ? ex.message : "failed" }); }
    finally { setBusy(""); }
  }

  const tone = STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? "muted";

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <Badge tone={tone}>{c.status.replace("_", " ")}</Badge>
        <span className="text-small text-text-secondary truncate">
          {entry?.title || entry?.signature_normalized.slice(0, 70) || `entry ${c.entry_id.slice(0, 8)}`}
        </span>
        <span className="text-tiny text-text-muted font-mono">{c.entry_id.slice(0, 8)}</span>
        <span className="text-tiny text-text-muted">{new Date(c.created_at).toLocaleString()}</span>
        <div className="ml-auto flex items-center gap-2">
          <Btn onClick={() => setOpen((v) => !v)}>{open ? "Hide diff" : "Review diff"}</Btn>
          {canReject && (
            <Btn variant="danger" disabled={busy === "reject"} onClick={reject}>
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </Btn>
          )}
          {canApprove && (
            <Btn variant="fill" disabled={busy === "approve"} onClick={approve}>
              {busy === "approve" ? "Approving…" : "Approve"}
            </Btn>
          )}
          {!canApprove && c.status === "awaiting_approval" && (
            <span className="text-tiny text-text-muted">
              only the submitter can approve
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-line-900 p-4 grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-tiny uppercase tracking-widest text-text-muted mb-1.5">
              before — private recipe
            </div>
            <Code className="max-h-64 overflow-auto">
              {String(entry?.fix?.recipe ?? "loading…")}
            </Code>
          </div>
          <div>
            <div className="text-tiny uppercase tracking-widest text-text-muted mb-1.5">
              after — proposed redacted generalization
            </div>
            <Code className="max-h-64 overflow-auto">
              {String(c.diff_summary?.recipe ?? c.diff_summary?.summary ?? "—")}
            </Code>
          </div>
          <div className="md:col-span-2 text-tiny text-text-muted">
            was validated before promotion: {c.diff_summary?.was_validated ?? "—"}
            {entry?.verified ? " · entry is verified" : ""}
          </div>
        </div>
      )}

      {msg && (
        <div role="status" className={`border-t border-line-900 px-4 py-2.5 text-small ${msg.ok ? "text-brand-success" : "text-brand-danger"}`}>
          {msg.text}
        </div>
      )}
    </Card>
  );
}

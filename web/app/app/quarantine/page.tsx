"use client";

/** Quarantine — entries the scanner refused to store (secrets or
 * prompt-injection patterns), with the reason, the flagged payload, and
 * dismiss for owners/admins. Data: GET /quarantine, POST /quarantine/{id}/dismiss. */
import { useState } from "react";
import useSWR from "swr";
import { api, type QuarantineItem } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Badge, Btn, Card, Code, Empty, ErrorNote, PageHead, SectionTitle, fmt,
} from "@/components/dashboard/ui";

export default function QuarantinePage() {
  const { teamId, role } = useTeam();
  const canDismiss = role === "owner" || role === "admin";
  const { data, error, isLoading, mutate } = useSWR<QuarantineItem[], Error>(
    teamId ? ["quarantine", teamId] : null, () => api.quarantine(teamId));
  const [open, setOpen] = useState<string>("");
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  async function dismiss(id: string) {
    setBusy(id); setMsg("");
    try {
      await api.dismissQuarantine(id);
      setMsg("Dismissed — the payload is gone and was never stored as a memory.");
      mutate();
    } catch (ex) { setMsg(ex instanceof Error ? ex.message : "dismiss failed"); }
    finally { setBusy(""); }
  }

  return (
    <div className="space-y-5">
      <PageHead
        title="Quarantine"
        sub="Scan hits: payloads that looked like secrets or prompt injection. They are never written to memory; review the reason and dismiss."
      />
      <ErrorNote error={error} />
      {isLoading && <div className="space-y-3">{[0, 1].map((i) => (
        <div key={i} className="h-20 rounded-card bg-ink-800 animate-pulse" />
      ))}</div>}

      {!isLoading && !error && !(data ?? []).length && (
        <Empty
          title="Nothing quarantined"
          body="When a trace or contribution trips the secret or prompt-injection scanners, it lands here instead of becoming a memory."
          cta={{ label: "See sharing", href: "/app/sharing" }}
        />
      )}

      {msg && <p role="status" className="text-small text-text-secondary">{msg}</p>}

      <div className="space-y-3">
        {(data ?? []).map((q) => (
          <Card key={q.id} className="overflow-hidden">
            <div className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1.5">
                {(q.reasons ?? []).map((r) => <Badge key={r} tone="bad">{r}</Badge>)}
                {!q.reasons?.length && <Badge tone="bad">flagged</Badge>}
              </div>
              <Badge>{q.source}</Badge>
              <span className="text-tiny text-text-muted">{fmt.dt(q.created_at)}</span>
              <div className="ml-auto flex gap-2">
                <Btn onClick={() => setOpen(open === q.id ? "" : q.id)}>
                  {open === q.id ? "Hide payload" : "Inspect"}
                </Btn>
                {canDismiss ? (
                  <Btn variant="danger" disabled={busy === q.id} onClick={() => dismiss(q.id)}>
                    {busy === q.id ? "Dismissing…" : "Dismiss"}
                  </Btn>
                ) : (
                  <span className="text-tiny text-text-muted self-center">
                    only owners/admins can dismiss
                  </span>
                )}
              </div>
            </div>
            {open === q.id && (
              <div className="border-t border-line-900 p-4">
                <SectionTitle>Flagged payload</SectionTitle>
                <Code className="max-h-72 overflow-auto">
                  {JSON.stringify(q.payload, null, 2)}
                </Code>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

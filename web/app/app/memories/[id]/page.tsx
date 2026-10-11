"use client";

/** Memory detail — one entry: the attempts and why each failed, the
 * constraints, the fix recipe, the confidence breakdown exactly as the
 * backend's scorer computes it, the provenance links, and the actions
 * (Verify by replay, Promote to the sharing queue).
 *
 * "Share with team" is not a separate action: a private entry is already
 * team-scoped. Publishing globally is the Promotion flow, which always
 * goes through explicit approval. */
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { api, type Attempt, type EntryDetail } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Badge, Btn, Card, Code, Confidence, ErrorNote, PageHead, SectionTitle,
  Skeleton, SkeletonRows, inputCls, fmt,
} from "@/components/dashboard/ui";

export default function MemoryDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { data: e, error, isLoading, mutate } =
    useSWR<EntryDetail, Error>(id ? ["entry", id] : null, () => api.entry(id));

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <SkeletonRows n={3} h="h-16" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error) return <ErrorNote error={error} />;
  if (!e) return null;

  return (
    <div className="space-y-6">
      <Link href="/app/memories" className="text-small text-text-muted hover:text-text-secondary">
        ← all memories
      </Link>

      <PageHead
        title={e.title || e.signature_normalized.slice(0, 80) || "Untitled failure"}
        sub={undefined}
        actions={
          <div className="flex items-center gap-1.5">
            {e.verified && <Badge tone="good">verified</Badge>}
            {e.seeded && <Badge tone="warn">seeded</Badge>}
            <Badge>{e.scope}</Badge>
          </div>
        }
      />

      <ErrorSummary text={e.redacted_error_text} />

      <div className="grid lg:grid-cols-[1fr_20rem] gap-6 items-start">
        <div className="space-y-6">
          {/* attempts */}
          <section>
            <SectionTitle>Failed attempts ({e.attempts?.length ?? 0})</SectionTitle>
            <Card className="divide-y divide-line-900">
              {(e.attempts ?? []).map((a, i) => <AttemptRow key={i} a={a} i={i} />)}
              {!e.attempts?.length && (
                <p className="px-4 py-5 text-small text-text-muted">
                  No individual attempts were recorded on this entry.
                </p>
              )}
            </Card>
          </section>

          {/* constraints */}
          <section>
            <SectionTitle>Constraints</SectionTitle>
            <Card className="px-4 py-3">
              {(e.constraints ?? []).length ? (
                <ul className="space-y-1.5">
                  {(e.constraints ?? []).map((c, i) => (
                    <li key={i} className="text-small text-text-secondary flex gap-2">
                      <span className="text-text-muted">·</span>
                      <span className="min-w-0 break-words">
                        {typeof c === "string" ? c : JSON.stringify(c)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-small text-text-muted">None recorded.</p>
              )}
            </Card>
          </section>

          {/* fix */}
          <section>
            <SectionTitle right={e.fix?.verified ? <Badge tone="good">verified</Badge> : <Badge>muted</Badge>}>
              The fix that worked
            </SectionTitle>
            <Card className="p-4 space-y-3">
              {e.fix?.summary && <p className="text-small text-text-secondary">{e.fix.summary}</p>}
              <Code>{String(e.fix?.recipe ?? "")}</Code>
              {!e.fix && (
                <p className="text-small text-text-muted">
                  No fix recorded yet — this is a known failure without a verified resolution.
                </p>
              )}
            </Card>
          </section>

          {/* provenance */}
          <section>
            <SectionTitle>Provenance</SectionTitle>
            <Card className="px-4 py-3 space-y-2 text-tiny">
              <ProvenanceRow k="neatlogs trace" v={e.neatlogs_trace_id} />
              <ProvenanceRow k="Entire checkpoint" v={e.entire_checkpoint_id} />
              <ProvenanceRow k="recorded" v={fmt.dt(e.created_at)} />
              <ProvenanceRow k="last real reuse" v={fmt.dt(e.last_reuse_at)} />
              <ProvenanceRow k="project" v={e.project_id ?? null} mono />
            </Card>
          </section>

          {/* reuse events */}
          <section>
            <SectionTitle>Reuse events ({e.reuse_events?.length ?? 0})</SectionTitle>
            <Card className="divide-y divide-line-900">
              {(e.reuse_events ?? []).map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-small">
                  <Badge tone={r.outcome === "success" ? "good" : "bad"}>{r.outcome}</Badge>
                  {r.kind === "test" && <Badge tone="warn">test</Badge>}
                  <span className="text-text-muted">{fmt.ago(r.at) ?? fmt.dt(r.at)}</span>
                </div>
              ))}
              {!e.reuse_events?.length && (
                <p className="px-4 py-5 text-small text-text-muted">
                  Never reused yet — confidence stays at its prior until an agent actually replays this fix.
                </p>
              )}
            </Card>
          </section>
        </div>

        {/* right rail: confidence + actions */}
        <div className="space-y-4">
          <ConfidencePanel e={e} />
          <ActionsPanel e={e} onDone={() => mutate()} />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- parts */
function ErrorSummary({ text }: { text: string }) {
  return (
    <Card className="p-4">
      <div className="text-tiny uppercase tracking-widest text-text-muted mb-1.5">error (redacted)</div>
      <Code>{text}</Code>
    </Card>
  );
}

function AttemptRow({ a, i }: { a: Attempt; i: number }) {
  const reason = a.reason ?? a.error ?? a.summary ?? a.outcome;
  return (
    <div className="px-4 py-3 flex gap-3">
      <span className="font-mono text-tiny text-text-muted mt-0.5">#{i + 1}</span>
      <div className="min-w-0">
        <div className="text-small text-text-secondary break-words">
          {typeof reason === "string" && reason ? reason : JSON.stringify(a).slice(0, 300)}
        </div>
        {typeof a.parent_attempt_id === "string" && a.parent_attempt_id && (
          <div className="text-tiny text-text-muted font-mono mt-1">
            branched from {a.parent_attempt_id.slice(0, 8)}
          </div>
        )}
      </div>
    </div>
  );
}

function ProvenanceRow({ k, v, mono }: { k: string; v: string | null; mono?: boolean }) {
  if (!v) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-text-muted">{k}</span>
      <span className={`text-text-secondary truncate ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}

function ConfidencePanel({ e }: { e: EntryDetail }) {
  const c = e.confidence;
  return (
    <Card className="p-4">
      <SectionTitle>Confidence</SectionTitle>
      <div className="text-h3 font-bold font-mono mb-1">{fmt.dec(c?.score, 3) ?? "—"}</div>
      <p className="text-tiny text-text-muted mb-3">
        score = base × env match × recency decay
      </p>
      <dl className="space-y-1.5 text-tiny">
        <Row k="base (α / α+β)" v={`${fmt.dec(c?.alpha, 2)} / ${fmt.dec(c?.alpha !== undefined && c?.beta !== undefined ? c.alpha + c.beta : null, 2)}`} />
        <Row k="α (successes)" v={fmt.dec(c?.alpha, 2)} />
        <Row k="β (failures)" v={fmt.dec(c?.beta, 2)} />
        <Row k="env match" v={fmt.dec(c?.env_match, 3)} />
        <Row k="recency decay" v={fmt.dec(c?.recency_decay, 3)} />
        <Row k="observations" v={String(c?.observations ?? e.observations ?? 0)} />
        <Row k="verified" v={c?.verified ? "yes" : "no"} />
      </dl>
      <div className="mt-3">
        <Confidence alpha={e.alpha} beta={e.beta} score={c?.score} observations={e.observations ?? 0} />
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-text-muted">{k}</dt>
      <dd className="font-mono text-text-secondary">{v ?? "—"}</dd>
    </div>
  );
}

function ActionsPanel({ e, onDone }: { e: EntryDetail; onDone: () => void }) {
  const { teamId } = useTeam();
  const router = useRouter();
  const [repo, setRepo] = useState("");
  const [busy, setBusy] = useState<"" | "verify" | "promote">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [log, setLog] = useState<string>("");

  const tid = e.team_id ?? teamId;

  async function verify(ev: FormEvent) {
    ev.preventDefault();
    if (!repo.trim()) return;
    setBusy("verify"); setMsg(null); setLog("");
    try {
      const r = await api.verify(e.id, repo.trim());
      setLog(r.log_tail || "");
      setMsg(r.verified
        ? { ok: true, text: "Replayed on a clean clone — marked verified." }
        : { ok: false, text: "Replay did not pass; not marked verified." });
      onDone();
    } catch (ex) { setMsg({ ok: false, text: ex instanceof Error ? ex.message : "verify failed" }); }
    finally { setBusy(""); }
  }

  async function promote() {
    setBusy("promote"); setMsg(null);
    try {
      const r = await api.promote(e.id, tid);
      setMsg({ ok: true, text: `Queued for approval (${r.status}). Nothing is global until it is approved.` });
    } catch (ex) { setMsg({ ok: false, text: ex instanceof Error ? ex.message : "promote failed" }); }
    finally { setBusy(""); }
  }

  return (
    <Card className="p-4 space-y-4">
      <SectionTitle>Actions</SectionTitle>

      <p className="text-tiny text-text-muted">
        Private here means <span className="text-text-secondary">your team</span> — every member
        already sees this memory. Promoting is what makes it global, and it always
        waits for approval of the redacted diff.
      </p>

      <form onSubmit={verify} className="space-y-2">
        <label className="block">
          <span className="block text-tiny text-text-muted mb-1">Verify — replay the fix on a clean clone</span>
          <input value={repo} onChange={(ev) => setRepo(ev.target.value)}
            placeholder="https://github.com/you/repo" className={inputCls} />
        </label>
        <Btn variant="fill" type="submit" disabled={busy === "verify" || !repo.trim() || !e.fix}>
          {busy === "verify" ? "Replaying…" : "Verify"}
        </Btn>
        {!e.fix && <p className="text-tiny text-text-muted">Nothing to verify — no fix recorded.</p>}
      </form>

      {log && <Code className="max-h-48 overflow-auto">{log}</Code>}

      <div className="space-y-2">
        <Btn variant={e.verified ? "fill" : "outline"} disabled={busy === "promote" || !e.verified}
          onClick={promote}>
          {busy === "promote" ? "Queuing…" : "Promote to global"}
        </Btn>
        {!e.verified && (
          <p className="text-tiny text-text-muted">Only verified fixes can be promoted.</p>
        )}
        {e.verified && (
          <p className="text-tiny text-text-muted">
            Goes to the <Link href="/app/sharing" className="text-text-secondary underline">sharing queue</Link> for approval.
          </p>
        )}
      </div>

      {msg && (
        <p role="status" className={`text-small ${msg.ok ? "text-brand-success" : "text-brand-danger"}`}>
          {msg.text}
        </p>
      )}
      {msg?.ok && msg.text.startsWith("Queued") && (
        <button onClick={() => router.push("/app/sharing")} className="text-small text-text-secondary underline">
          Open the sharing queue →
        </button>
      )}
    </Card>
  );
}

"use client";

/** Run detail — GET /runs/{id} for the recorded run and its events, plus a
 * live SSE tail on /api/runs/{id}/stream (the backend polls its event table
 * and pushes new phases as the runner appends them). The stream is closed on
 * unmount and skipped entirely for finished runs. */
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { api, type RunDetail } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Badge, Card, Code, Empty, ErrorNote, PageHead, SectionTitle, Skeleton,
  SkeletonRows, StatusDot, fmt,
} from "@/components/dashboard/ui";

interface LiveEvent { seq: number; phase: string; payload: Record<string, unknown>; at?: string }

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const { projectById } = useTeam();
  const { data: run, error, isLoading } = useSWR<RunDetail, Error>(
    id ? ["run", id] : null, () => api.run(id), { refreshInterval: 10000 });

  const [live, setLive] = useState<LiveEvent[]>([]);
  const [liveDone, setLiveDone] = useState<string | null>(null);
  const [streamErr, setStreamErr] = useState<string>("");
  const closed = useRef(false);

  // open the SSE tail once we know the run is still going
  useEffect(() => {
    closed.current = false;
    if (!id || !run || (run.status !== "running" && run.finished_at)) return;
    if (typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/runs/${id}/stream`);
    es.onmessage = (ev) => {
      try { setLive((prev) => {
        const next = JSON.parse(ev.data) as LiveEvent;
        return prev.some((p) => p.seq === next.seq) ? prev : [...prev, next];
      }); } catch { /* keep the stream alive on a malformed frame */ }
    };
    es.addEventListener("done", (ev) => {
      setLiveDone((ev as MessageEvent).data);
      es.close();
    });
    es.onerror = () => {
      // EventSource retries by itself; if the document is being torn down
      // or the run ended, close rather than spin.
      if (closed.current) { es.close(); return; }
      setStreamErr("live stream interrupted — the panel below is the recorded history");
    };
    return () => { closed.current = true; es.close(); };
  }, [id, run?.status, run?.finished_at]);

  const events = useMemo<LiveEvent[]>(() => {
    const map = new Map<number, LiveEvent>();
    for (const e of run?.events ?? []) map.set(e.seq, e);
    for (const e of live) if (!map.has(e.seq)) map.set(e.seq, e);
    return Array.from(map.values()).sort((a, b) => a.seq - b.seq);
  }, [run?.events, live]);

  const retrieved = useMemo(() => events
    .filter((e) => e.phase === "retrieve")
    .flatMap((e) => {
      const p = e.payload as { dead_ends?: unknown; entries?: unknown; results?: unknown };
      return [p.dead_ends ?? p.entries ?? p.results ?? e.payload];
    }), [events]);

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <SkeletonRows n={4} h="h-12" />
      </div>
    );
  }
  if (error) return <ErrorNote error={error} />;
  if (!run) return null;

  const running = run.status === "running" && !run.finished_at;

  return (
    <div className="space-y-6">
      <Link href="/app/runs" className="text-small text-text-muted hover:text-text-secondary">
        ← all runs
      </Link>

      <PageHead
        title={run.task}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 text-small text-text-secondary">
              <StatusDot status={run.status} />{run.status}
            </span>
            {running && <Badge tone="warn">live</Badge>}
          </div>
        }
      />

      <Card className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
        <Meta k="agent" v={run.agent} />
        <Meta k="model" v={run.model} />
        <Meta k="agent version" v={run.agent_version} />
        <Meta k="project" v={projectById(run.project_id)} />
        <Meta k="duration" v={fmt.dur(run.duration)} />
        <Meta k="tokens in / out"
          v={run.tokens_in != null || run.tokens_out != null
            ? `${fmt.num(run.tokens_in)} / ${fmt.num(run.tokens_out)}` : null} />
        <Meta k="context used" v={run.context_used ? "yes" : "no"} />
        <Meta k="started" v={fmt.dt(run.started_at)} />
      </Card>

      {streamErr && <ErrorNote error={new Error(streamErr)} />}
      {liveDone && (
        <p className="text-small text-text-secondary">
          Stream finished — status <span className="font-mono">{liveDone}</span>
        </p>
      )}

      <section>
        <SectionTitle right={<span className="text-tiny text-text-muted">{events.length} events</span>}>
          Phases
        </SectionTitle>
        <Card className="divide-y divide-line-900">
          {events.map((e) => (
            <div key={e.seq} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-tiny text-text-muted">#{e.seq}</span>
                <Badge tone={e.phase === "verify" ? "good" : e.phase === "retry" ? "warn" : "muted"}>
                  {e.phase}
                </Badge>
                <span className="text-tiny text-text-muted">{e.at ? fmt.dt(e.at) : "live"}</span>
              </div>
              {Object.keys(e.payload ?? {}).length > 0 && (
                <Code className="mt-2">{JSON.stringify(e.payload, null, 2)}</Code>
              )}
            </div>
          ))}
          {!events.length && (
            <p className="px-4 py-6 text-small text-text-muted">
              No events recorded for this run yet — the runner streams them as
              it works (retrieve → attempt → test → verify → record).
            </p>
          )}
          {running && !events.length && (
            <div className="px-4 pb-4 flex items-center gap-2 text-tiny text-text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              listening for live events…
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Retrieved dead ends</SectionTitle>
        {retrieved.length ? (
          <Card className="p-4">
            <Code>{JSON.stringify(retrieved, null, 2)}</Code>
          </Card>
        ) : (
          <Card className="px-4 py-5">
            <p className="text-small text-text-muted">
              Nothing was retrieved for this run — either the run predates
              retrieval, or the agent ran without DeadEnd context.
            </p>
          </Card>
        )}
      </section>

      {run.context_pack && (
        <section>
          <SectionTitle>Context pack</SectionTitle>
          <Card className="p-4"><Code>{JSON.stringify(run.context_pack, null, 2)}</Code></Card>
        </section>
      )}
    </div>
  );
}

function Meta({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <div className="text-tiny uppercase tracking-widest text-text-muted">{k}</div>
      <div className="text-small text-text-secondary mt-0.5 font-mono break-words">
        {v ?? <span className="text-text-muted">no data yet</span>}
      </div>
    </div>
  );
}

"use client";

/** Memories — Private / Global tabs over GET /entries (server-side filters:
 * project, verified, confidence range, seeded) or POST /entries/search when
 * the top-bar search term is set. Rows show title, project, confidence with
 * its observation count, verified and seeded badges.
 *
 * Note: entries do not record which agent produced them (agents are a
 * property of runs), so there is deliberately no agent column here. */
import Link from "next/link";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { api, type EntryQuery, type EntryView } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Badge, Card, Confidence, Empty, ErrorNote, PageHead, Select, SkeletonRows,
  inputCls,
} from "@/components/dashboard/ui";

const PER_PAGE = 20;

export default function MemoriesPage() {
  const { teamId, projects, projectFilter, setProjectFilter, search, setSearch } = useTeam();
  const [scope, setScope] = useState<"private" | "global">("private");
  const [verified, setVerified] = useState<"" | "true" | "false">("");
  const [seeded, setSeeded] = useState<"" | "true" | "false">("");
  const [minConf, setMinConf] = useState("");
  const [maxConf, setMaxConf] = useState("");
  const [page, setPage] = useState(1);

  const query = useMemo<EntryQuery | null>(() => {
    if (!teamId && scope === "private") return null;
    const q: EntryQuery = { scope, page, per_page: PER_PAGE };
    if (scope === "private") q.team_id = teamId;
    if (projectFilter) q.project_id = projectFilter;
    if (verified !== "") q.verified = verified === "true";
    if (seeded !== "") q.seeded = seeded === "true";
    if (minConf !== "") q.min_conf = Number(minConf);
    if (maxConf !== "") q.max_conf = Number(maxConf);
    return q;
  }, [scope, teamId, page, projectFilter, verified, seeded, minConf, maxConf]);

  const searching = search.trim().length > 0;

  const { data, error, isLoading, mutate } = useSWR(
    searching
      ? ["entries/search", search, scope, teamId]
      : query ? ["entries", query] : null,
    async () => searching
      ? { page, per_page: PER_PAGE,
          entries: (await api.searchEntries({ q: search.trim(), scope, team_id: teamId || undefined })).results }
      : api.entries(query!),
    { keepPreviousData: true, shouldRetryOnError: false }
  );

  const rows = data?.entries ?? [];
  const filtersActive = !!(projectFilter || verified || seeded || minConf || maxConf);

  return (
    <div className="space-y-5">
      <PageHead
        title="Memories"
        sub="Every stored failure with the fix that worked — private to your team, or global once promoted."
      />

      {/* scope tabs */}
      <div role="tablist" aria-label="Memory scope" className="flex gap-1 border border-line-800 rounded-full p-1 w-fit">
        {(["private", "global"] as const).map((s) => (
          <button key={s} role="tab" aria-selected={scope === s}
            onClick={() => { setScope(s); setPage(1); }}
            className={`px-4 py-1.5 rounded-full text-small transition-colors ${
              scope === s ? "bg-ink-700 text-text-primary" : "text-text-muted hover:text-text-secondary"}`}>
            {s === "private" ? "Private" : "Global"}
          </button>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block text-tiny text-text-muted mb-1">project</span>
          <Select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setPage(1); }}>
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
          </Select>
        </label>
        <label className="block">
          <span className="block text-tiny text-text-muted mb-1">verified</span>
          <Select value={verified} onChange={(e) => { setVerified(e.target.value as typeof verified); setPage(1); }}>
            <option value="">any</option><option value="true">verified only</option>
            <option value="false">unverified only</option>
          </Select>
        </label>
        <label className="block">
          <span className="block text-tiny text-text-muted mb-1">seeded</span>
          <Select value={seeded} onChange={(e) => { setSeeded(e.target.value as typeof seeded); setPage(1); }}>
            <option value="">any</option><option value="true">seeded</option>
            <option value="false">organic</option>
          </Select>
        </label>
        <label className="block">
          <span className="block text-tiny text-text-muted mb-1">confidence min</span>
          <input type="number" min="0" max="1" step="0.05" value={minConf} placeholder="0"
            onChange={(e) => { setMinConf(e.target.value); setPage(1); }}
            className={`${inputCls} w-24`} />
        </label>
        <label className="block">
          <span className="block text-tiny text-text-muted mb-1">confidence max</span>
          <input type="number" min="0" max="1" step="0.05" value={maxConf} placeholder="1"
            onChange={(e) => { setMaxConf(e.target.value); setPage(1); }}
            className={`${inputCls} w-24`} />
        </label>
        {searching && (
          <button onClick={() => { setSearch(""); setPage(1); }}
            className="text-small text-text-secondary hover:text-text-primary pb-2">
            clear search “{search}”
          </button>
        )}
        {filtersActive && !searching && (
          <button onClick={() => { setProjectFilter(""); setVerified(""); setSeeded(""); setMinConf(""); setMaxConf(""); setPage(1); }}
            className="text-small text-text-secondary hover:text-text-primary pb-2">
            reset filters
          </button>
        )}
      </div>

      <ErrorNote error={error} />
      {isLoading && <SkeletonRows n={5} h="h-12" />}

      {!isLoading && !error && rows.length === 0 && (
        <Empty
          title={searching ? `No memories match “${search}”` : "No memories yet"}
          body={scope === "private"
            ? "A memory appears here when an agent records a failed attempt and the fix that finally worked — through deadend-runner or the VS Code extension."
            : "Global memories are published from a team's private ones, and only after someone approves the redacted diff on the Sharing page."}
          cta={scope === "private"
            ? { label: "Connect the extension", href: "/app/settings" }
            : { label: "See the sharing queue", href: "/app/sharing" }}
        />
      )}

      {!isLoading && rows.length > 0 && (
        <Card className="divide-y divide-line-900">
          {rows.map((e) => <Row key={e.id} e={e} projectOf={projectOf(projects)} />)}
        </Card>
      )}

      {/* pagination */}
      {data && rows.length >= PER_PAGE && (
        <div className="flex items-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
            className="pill-outline px-4 py-1.5 text-small disabled:opacity-40">← prev</button>
          <span className="text-tiny text-text-muted">page {page}</span>
          <button disabled={rows.length < PER_PAGE} onClick={() => setPage((p) => p + 1)}
            className="pill-outline px-4 py-1.5 text-small disabled:opacity-40">next →</button>
        </div>
      )}
    </div>
  );
}

function projectOf(projects: { project_id: string; name: string }[]) {
  return (id: string | null) =>
    id ? projects.find((p) => p.project_id === id)?.name ?? id.slice(0, 8) : "—";
}

function Row({ e, projectOf: name }: { e: EntryView; projectOf: (id: string | null) => string }) {
  return (
    <Link href={`/app/memories/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-850 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="text-small text-text-primary truncate">
          {e.title || e.signature_normalized.slice(0, 90) || e.redacted_error_text.slice(0, 90)}
        </div>
        <div className="text-tiny text-text-muted truncate font-mono">
          {name(e.project_id)} · {e.signature_hash.slice(0, 8)}
        </div>
      </div>
      <div className="hidden sm:block w-28 text-right">
        <Confidence alpha={e.alpha} beta={e.beta} observations={e.observations ?? 0} />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {e.verified && <Badge tone="good">verified</Badge>}
        {e.seeded && <Badge tone="warn">seeded</Badge>}
        {e.scope === "global" && <Badge>global</Badge>}
      </div>
    </Link>
  );
}

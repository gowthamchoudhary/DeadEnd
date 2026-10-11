"use client";

/**
 * Economics — DeadEnd's real usage as a CFO.ai business-plan input.
 *
 * MEASURED cards come straight from GET /economics (runs, tokens,
 * success rate, reuse deltas) and null renders as "no data yet".
 * Everything the user types (prices, infra costs, tiers, cash/burn,
 * plan URL) is visibly labelled "assumption" and saved to
 * team_economics via PUT /economics/prices + PUT /economics/settings.
 * Exports produce tidy long-format CSV/XLSX rows
 * (metric, scenario, value, unit, source).
 */
import { useMemo, useState } from "react";
import useSWR from "swr";
import { api, type EconomicsResp, type EconTier } from "@/lib/api";
import { useTeam } from "@/lib/team";
import {
  Badge, Btn, Card, ErrorNote, Field, PageHead, SectionTitle, SkeletonRows,
  fmt, inputCls,
} from "@/components/dashboard/ui";

const NO_DATA = "no data yet";

export default function EconomicsPage() {
  const { teamId } = useTeam();
  const { data: econ, error, isLoading, mutate } = useSWR<EconomicsResp, Error>(
    teamId ? ["economics", teamId] : null,
    () => api.economics(teamId), { shouldRetryOnError: false });

  if (isLoading) {
    return (<div className="space-y-4" aria-busy="true">
      <SkeletonRows n={5} />
    </div>);
  }

  return (
    <div className="space-y-8">
      <PageHead
        title="Economics"
        sub="Inputs for a CFO.ai business plan. Measured cards come from real runs and reuse events only; every number you type is an assumption and is labelled as one."
      />
      <ErrorNote error={error} />

      {econ && <>
        <MeasuredCards econ={econ} />
        <PriceTable econ={econ} reload={mutate} />
        <Planner econ={econ} reload={mutate} />
        <ExportCard econ={econ} />
        <BusinessPlanCard econ={econ} reload={mutate} />
      </>}
    </div>
  );
}

/* ------------------------------------------------------- measured cards */
function SourceTag({ source }: { source?: "measured" | "assumption" | null }) {
  if (!source) return null;
  return <Badge tone={source === "measured" ? "good" : "warn"}>{source}</Badge>;
}

function EconCard({ label, value, unit, source, hint }: {
  label: string; value: string | null; unit?: string;
  source?: "measured" | "assumption" | null | undefined; hint?: string;
}) {
  return (
    <div className="border border-line-800 rounded-card bg-ink-900 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-tiny uppercase tracking-widest text-text-muted">{label}</span>
        <SourceTag source={source} />
      </div>
      <div className="mt-1.5 text-h3 font-bold font-mono">
        {value !== null ? <>{value}<span className="text-tiny text-text-muted font-sans font-normal ml-1">{unit}</span></>
          : <span className="text-text-muted font-sans text-body">{NO_DATA}</span>}
      </div>
      {hint && <div className="mt-1 text-tiny text-text-muted">{hint}</div>}
    </div>
  );
}

function MeasuredCards({ econ }: { econ: EconomicsResp }) {
  const m = econ.measured;
  const delta = m.context_delta_by_project?.[0] ?? null;
  const tokensSaved = m.tokens_saved_per_reuse ??
    (delta && delta.tokens_per_run_with != null && delta.tokens_per_run_without != null
      ? Math.round(delta.tokens_per_run_without - delta.tokens_per_run_with) : null);
  const timeSaved = m.time_saved_per_reuse_s ??
    (delta && delta.duration_per_run_with != null && delta.duration_per_run_without != null
      ? Math.round(delta.duration_per_run_without - delta.duration_per_run_with) : null);
  return (
    <section>
      <SectionTitle right={<span className="text-tiny text-text-muted font-mono">GET /economics</span>}>
        Unit economics — measured
      </SectionTitle>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <EconCard label="runs" value={fmt.num(m.runs_total)} source="measured" />
        <EconCard label="cost per run" value={m.cost_per_run_usd != null ? fmt.dec(m.cost_per_run_usd, 4) : null}
          unit="USD" source={m.cost_source}
          hint={m.cost_source ?? "needs agent prices + reported tokens"} />
        <EconCard label="tokens per run" value={fmt.num(m.tokens_per_run)} source="measured" />
        <EconCard label="duration per run" value={fmt.dur(m.duration_per_run_s)} source="measured" />
        <EconCard label="success rate" value={fmt.pct(m.success_rate)} source="measured" />
        <EconCard label="reuse events" value={m.reuse_events ? fmt.num(m.reuse_events) : null}
          unit={m.reuse_events ? "recorded" : undefined} source="measured" />
        <EconCard label="tokens saved per reuse" value={tokensSaved != null && tokensSaved > 0 ? fmt.num(tokensSaved) : null}
          unit="tok"
          hint={tokensSaved != null && tokensSaved <= 0 ? "measured: no token saving" : undefined} />
        <EconCard label="time saved per reuse" value={timeSaved != null && timeSaved > 0 ? fmt.dur(timeSaved) : null}
          hint={timeSaved != null && timeSaved <= 0 ? "measured: no time saving" : undefined} />
        <EconCard label="reuses per run" value={fmt.num(m.reuses_per_run)} source="measured" />
      </div>
      {delta && (
        <Card className="mt-3 px-4 py-3 text-small text-text-secondary">
          Same-project delta (measured, {delta.with_runs} with vs {delta.without_runs} without context):
          tokens/run {fmt.num(delta.tokens_per_run_without) ?? NO_DATA} vs {fmt.num(delta.tokens_per_run_with) ?? NO_DATA}
          {" · "}duration {fmt.dur(delta.duration_per_run_without) ?? NO_DATA} vs {fmt.dur(delta.duration_per_run_with) ?? NO_DATA}
          {" · "}success {fmt.pct(delta.success_without)} vs {fmt.pct(delta.success_with)}
        </Card>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ price table */
function PriceTable({ econ, reload }: { econ: EconomicsResp; reload: () => void }) {
  const [prices, setPrices] = useState(econ.assumptions.prices_per_mtok);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const agents = Object.keys(econ.measured.per_agent);
  const rows = agents.length ? agents : Object.keys(prices);

  async function save() {
    setBusy(true); setSavedMsg("");
    try {
      await api.putEconPrices(econ.team_id, prices);
      setSavedMsg("Prices saved.");
      reload();
    } catch (ex) {
      setSavedMsg(ex instanceof Error ? ex.message : "failed");
    } finally { setBusy(false); }
  }

  function upd(agent: string, key: "per_mtok_in" | "per_mtok_out", v: string) {
    const num = v.trim() === "" ? undefined : Number(v);
    setPrices({ ...prices, [agent]: { ...prices[agent], [key]: num } });
  }

  return (
    <section>
      <SectionTitle>Model prices <Badge tone="warn">assumption</Badge></SectionTitle>
      <Card className="px-4 py-4">
        <p className="text-tiny text-text-muted mb-3">
          USD per 1M tokens, per agent. Only used to price the REAL tokens already
          recorded — nothing is estimated from these alone.
        </p>
        {rows.length === 0 && <p className="text-small text-text-muted">{NO_DATA} — run an agent first.</p>}
        {rows.map((a) => (
          <div key={a} className="flex flex-wrap items-end gap-3 mb-3">
            <span className="text-small text-text-primary w-32">{a}</span>
            <label className="block">
              <span className="block text-tiny text-text-muted mb-1">$/1M in</span>
              <input type="number" step="0.01" min="0" className={`${inputCls} w-28`}
                value={prices[a]?.per_mtok_in ?? ""}
                onChange={(e) => upd(a, "per_mtok_in", e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-tiny text-text-muted mb-1">$/1M out</span>
              <input type="number" step="0.01" min="0" className={`${inputCls} w-28`}
                value={prices[a]?.per_mtok_out ?? ""}
                onChange={(e) => upd(a, "per_mtok_out", e.target.value)} />
            </label>
            <EconInlineCost econ={econ} agent={a} price={prices[a]} />
          </div>
        ))}
        <div className="flex items-center gap-3 mt-2">
          <Btn variant="fill" onClick={save} disabled={busy}>Save prices</Btn>
          {savedMsg && <span role="status" className="text-tiny text-text-muted">{savedMsg}</span>}
        </div>
      </Card>
    </section>
  );
}

function EconInlineCost({ econ, agent, price }: {
  econ: EconomicsResp;
  agent: string;
  price?: { per_mtok_in?: number; per_mtok_out?: number };
}) {
  const s = econ.measured.per_agent[agent];
  if (!s) return null;
  const hasPx = !!price?.per_mtok_in || !!price?.per_mtok_out;
  const cost = hasPx && s.cost_usd != null ? s.cost_usd : null;
  return (
    <span className="text-tiny text-text-muted">
      measured cost{cost != null ? <>: <b className="text-text-primary font-mono">${fmt.dec(cost, 4)}</b></> : <>: {NO_DATA} (no tokens reported)</>}
    </span>
  );
}

/* ---------------------------------------------------------------- planner */
const DEFAULT_TIERS: EconTier[] = [
  { name: "Free", seats: 25, price: 0, runs_per_seat: 20 },
  { name: "Team", seats: 10, price: 25, runs_per_seat: 150 },
  { name: "Enterprise", seats: 3, price: 200, runs_per_seat: 500 },
];

function Planner({ econ, reload }: { econ: EconomicsResp; reload: () => void }) {
  const [tiers, setTiers] = useState<EconTier[]>(econ.assumptions.tiers.length
    ? econ.assumptions.tiers : DEFAULT_TIERS);
  const [render, setRender] = useState(econ.assumptions.render_monthly_usd);
  const [supabase, setSupabase] = useState(econ.assumptions.supabase_monthly_usd);
  const [cash, setCash] = useState(econ.assumptions.cash_on_hand_usd);
  const [burn, setBurn] = useState(econ.assumptions.burn_monthly_usd);
  const [growth, setGrowth] = useState(econ.assumptions.growth_x || 2);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // cost per run drives calculated infra per plan run (user's own price data)
  const costPerRun = econ.measured.cost_per_run_usd;

  const calc = useMemo(() => {
    const scenarios = [{ name: "base", x: 1 }, { name: "growth", x: growth }];
    return scenarios.map(({ name, x }) => {
      const rev = tiers.reduce((acc, t) => acc + t.seats * x * t.price, 0);
      const runs = tiers.reduce((acc, t) => acc + t.seats * x * t.runs_per_seat
        * (t.price > 0 ? 1 : 0.15), 0); // free tier = eval usage assumption
      const modelCost = costPerRun != null ? runs * costPerRun : null;
      const infra = (render || 0) + (supabase || 0);
      const totalCost = infra + (modelCost ?? 0);
      const margin = rev - totalCost;
      const marginPct = rev > 0 ? margin / rev : null;
      const net = margin - (burn || 0);
      const breakeven = margin >= 0 ? (burn || 0) / Math.max(1, margin) : null;
      const runway = (burn || 0) > 0 ? (cash || 0) / (burn || 0) - 0 : (cash || 0) > 0 ? Infinity : null;
      return { name, x, rev, runs, modelCost, infra, margin, marginPct, net, breakeven, runway };
    });
  }, [tiers, growth, costPerRun, render, supabase, burn, cash]);

  async function save() {
    setBusy(true); setMsg("");
    try {
      await api.putEconSettings({
        team_id: econ.team_id, tiers, render_monthly: render,
        supabase_monthly: supabase, cash_on_hand: cash,
        burn_monthly: burn, growth_x: growth,
      });
      setMsg("Planner saved.");
      reload();
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "failed");
    } finally { setBusy(false); }
  }

  return (
    <section>
      <SectionTitle>Pricing planner <Badge tone="warn">all inputs are assumptions</Badge></SectionTitle>
      <div className="grid lg:grid-cols-2 gap-3">
        <Card className="px-4 py-4 space-y-3">
          {tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label><span className="block text-tiny text-text-muted mb-1">name</span>
                <input className={`${inputCls} w-28`} value={t.name}
                  onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></label>
              <label><span className="block text-tiny text-text-muted mb-1">seats</span>
                <input type="number" min="0" className={`${inputCls} w-24`} value={t.seats}
                  onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, seats: Number(e.target.value) } : x))} /></label>
              <label><span className="block text-tiny text-text-muted mb-1">$/seat/mo</span>
                <input type="number" step="1" min="0" className={`${inputCls} w-24`} value={t.price}
                  onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} /></label>
              <label><span className="block text-tiny text-text-muted mb-1">runs/seat/mo</span>
                <input type="number" min="0" className={`${inputCls} w-24`} value={t.runs_per_seat}
                  onChange={(e) => setTiers(tiers.map((x, j) => j === i ? { ...x, runs_per_seat: Number(e.target.value) } : x))} /></label>
              <Btn variant="danger" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>remove</Btn>
            </div>
          ))}
          <Btn onClick={() => setTiers([...tiers, { name: "New", seats: 5, price: 10, runs_per_seat: 50 }])}>add tier</Btn>
          <div className="grid grid-cols-2 gap-3 pt-3">
            <Field label="render $/mo"><input type="number" min="0" className={inputCls} value={render}
              onChange={(e) => setRender(Number(e.target.value))} /></Field>
            <Field label="supabase $/mo"><input type="number" min="0" className={inputCls} value={supabase}
              onChange={(e) => setSupabase(Number(e.target.value))} /></Field>
            <Field label="cash on hand"><input type="number" min="0" className={inputCls} value={cash}
              onChange={(e) => setCash(Number(e.target.value))} /></Field>
            <Field label="burn $/mo"><input type="number" min="0" className={inputCls} value={burn}
              onChange={(e) => setBurn(Number(e.target.value))} /></Field>
            <Field label="growth multiplier"><input type="number" step="0.1" min="1" className={inputCls} value={growth}
              onChange={(e) => setGrowth(Number(e.target.value))} /></Field>
          </div>
          <div className="flex items-center gap-3">
            <Btn variant="fill" onClick={save} disabled={busy}>Save planner</Btn>
            {msg && <span role="status" className="text-tiny text-text-muted">{msg}</span>}
          </div>
          <div className="text-tiny text-text-muted">
            cost per run {costPerRun != null
              ? <b className="text-text-primary font-mono">${fmt.dec(costPerRun, 4)}</b>
              : NO_DATA} <SourceTag source={costPerRun != null ? "measured" : null} /> — used to
            price the monthly runs in each tier.
          </div>
        </Card>

        <Card className="px-4 py-4 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line-800 text-tiny uppercase tracking-widest text-text-muted">
                <th className="py-2 font-normal">scenario</th>
                <th className="py-2 font-normal text-right">revenue</th>
                <th className="py-2 font-normal text-right">runs</th>
                <th className="py-2 font-normal text-right">model cost</th>
                <th className="py-2 font-normal text-right">margin</th>
                <th className="py-2 font-normal text-right">breakeven</th>
                <th className="py-2 font-normal text-right">runway</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-900">
              {calc.map((r) => (
                <tr key={r.name}>
                  <td className="py-2.5 text-small">{r.name}</td>
                  <td className="py-2.5 text-right font-mono text-small">${fmt.num(r.rev)}</td>
                  <td className="py-2.5 text-right font-mono text-small">{fmt.num(r.runs)}</td>
                  <td className="py-2.5 text-right font-mono text-small">
                    {r.modelCost != null ? `$${fmt.num(r.modelCost)}` : NO_DATA}
                  </td>
                  <td className="py-2.5 text-right font-mono text-small">${fmt.num(r.margin)}
                    {r.marginPct != null && <span className="text-tiny text-text-muted"> ({Math.round(r.marginPct * 100)}%)</span>}
                  </td>
                  <td className="py-2.5 text-right font-mono text-small">
                    {r.breakeven != null ? `${fmt.dec(r.breakeven, 1)} mo` : "—"}
                  </td>
                  <td className="py-2.5 text-right font-mono text-small">
                    {r.runway == null ? "—" : r.runway === Infinity ? "no burn" : `${fmt.dec(r.runway, 1)} mo`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-tiny text-text-muted mt-3">
            All computed values inherit their inputs&apos; labels: model cost per run is
            measured (when prices are set), revenue/margin/breakeven/runway are
            assumptions derived from your inputs.
          </p>
        </Card>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- export */
type Row = { metric: string; scenario: string; value: string; unit: string; source: string };

function buildRows(econ: EconomicsResp): Row[] {
  const m = econ.measured;
  const a = econ.assumptions;
  const costPerRun = m.cost_per_run_usd;
  const rows: Row[] = [
    { metric: "runs", scenario: "base", value: String(m.runs_total), unit: "count", source: "measured" },
    ...Object.entries(m.per_agent).map(([agent, s]) => ({
      metric: `tokens_in_${agent}`, scenario: "base", value: String(s.tokens_in ?? ""), unit: "tokens",
      source: s.tokens_in != null ? "measured" : "assumption" })),
    ...Object.entries(m.per_agent).map(([agent, s]) => ({
      metric: `tokens_out_${agent}`, scenario: "base", value: String(s.tokens_out ?? ""), unit: "tokens",
      source: s.tokens_out != null ? "measured" : "assumption" })),
    { metric: "duration_per_run", scenario: "base",
      value: m.duration_per_run_s != null ? String(m.duration_per_run_s) : "", unit: "seconds",
      source: m.duration_per_run_s != null ? "measured" : "assumption" },
    { metric: "success_rate", scenario: "base",
      value: m.success_rate != null ? String(m.success_rate) : "", unit: "ratio",
      source: m.success_rate != null ? "measured" : "assumption" },
    ...Object.entries(m.per_agent).map(([agent, s]) => ({
      metric: `cost_${agent}`, scenario: "base",
      value: s.cost_usd != null ? String(s.cost_usd) : "", unit: "USD",
      source: s.cost_usd != null ? "measured" : "assumption" })),
    { metric: "cost_per_run", scenario: "base",
      value: costPerRun != null ? String(costPerRun) : "", unit: "USD",
      source: costPerRun != null ? "measured" : "assumption" },
    { metric: "tokens_saved_per_reuse", scenario: "base",
      value: m.tokens_saved_per_reuse != null ? String(m.tokens_saved_per_reuse) : "", unit: "tokens",
      source: m.tokens_saved_per_reuse != null ? "measured" : "assumption" },
    { metric: "time_saved_per_reuse", scenario: "base",
      value: m.time_saved_per_reuse_s != null ? String(m.time_saved_per_reuse_s) : "", unit: "seconds",
      source: m.time_saved_per_reuse_s != null ? "measured" : "assumption" },
    { metric: "reuse_events", scenario: "base",
      value: String(m.reuse_events), unit: "count", source: "measured" },
    { metric: "render_cost", scenario: "base", value: String(a.render_monthly_usd),
      unit: "USD/mo", source: "assumption" },
    { metric: "supabase_cost", scenario: "base", value: String(a.supabase_monthly_usd),
      unit: "USD/mo", source: "assumption" },
    { metric: "cash_on_hand", scenario: "base", value: String(a.cash_on_hand_usd),
      unit: "USD", source: "assumption" },
    { metric: "burn", scenario: "base", value: String(a.burn_monthly_usd),
      unit: "USD/mo", source: "assumption" },
    { metric: "growth_multiplier", scenario: "growth", value: String(a.growth_x),
      unit: "x", source: "assumption" },
  ];
  return rows;
}

function csvOf(rows: Row[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return ["metric,scenario,value,unit,source",
    ...rows.map((r) => [r.metric, r.scenario, r.value, r.unit, r.source].map(esc).join(",")),
  ].join("\n");
}

function xlsxOf(rows: Row[]): Blob {
  /* SpreadsheetML 2003 (.xls+xml) — opens in Excel, Sheets, Numbers and cfo.ai
     spreadsheet upload without external deps. */
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const cell = (v: string) => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="DeadEnd economics">
  <Table>
   <Row>${["metric", "scenario", "value", "unit", "source"].map(cell).join("")}</Row>
   ${rows.map((r) => `<Row>${[r.metric, r.scenario, r.value, r.unit, r.source].map(cell).join("")}</Row>`).join("\n   ")}
  </Table>
 </Worksheet>
</Workbook>`;
  return new Blob([xml], { type: "application/vnd.ms-excel" });
}

function ExportCard({ econ }: { econ: EconomicsResp }) {
  const rows = buildRows(econ);
  function dl(name: string, blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }
  function copySummary() {
    const lines = rows.map((r) => `${r.metric} (${r.scenario}): ${r.value || "no data"} ${r.unit} [${r.source}]`);
    navigator.clipboard?.writeText(lines.join("\n"));
  }
  return (
    <section>
      <SectionTitle>Export</SectionTitle>
      <Card className="px-4 py-4">
        <p className="text-tiny text-text-muted mb-3">
          Tidy long format — columns: <code>metric, scenario, value, unit, source</code>.
          Scenario values are base or growth. Every row names its source.
        </p>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => dl(`deadend-economics-${econ.team_id.slice(0, 8)}.csv`,
            new Blob([csvOf(rows)], { type: "text/csv" }))}>Export CSV</Btn>
          <Btn onClick={() => dl(`deadend-economics-${econ.team_id.slice(0, 8)}.xls`,
            xlsxOf(rows))}>Export XLSX</Btn>
          <Btn onClick={copySummary}>Copy summary</Btn>
        </div>
      </Card>
    </section>
  );
}

/* -------------------------------------------------------------- plan card */
function BusinessPlanCard({ econ, reload }: { econ: EconomicsResp; reload: () => void }) {
  const [url, setUrl] = useState(econ.business_plan.url ?? "");
  const [title, setTitle] = useState(econ.business_plan.title ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!econ.business_plan.url) {
    return (
      <section>
        <SectionTitle>Business plan</SectionTitle>
        <Card className="px-4 py-4">
          <p className="text-small text-text-muted mb-3">
            Paste the URL of your published cfo.ai plan. Once saved it renders
            here and the landing page&apos;s &ldquo;Know what it costs&rdquo; section links to it.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="plan url"><input className={`${inputCls} min-w-[20rem]`} value={url}
              onChange={(e) => setUrl(e.target.value)} placeholder="https://cfo.ai/plans/…" /></Field>
            <Field label="title (optional)"><input className={`${inputCls} w-56`} value={title}
              onChange={(e) => setTitle(e.target.value)} placeholder="DeadEnd unit economics" /></Field>
            <Btn variant="fill" disabled={busy || !url.trim()} onClick={async () => {
              setBusy(true); setMsg("");
              try {
                await api.putEconSettings({ team_id: econ.team_id,
                  business_plan_url: url.trim(), business_plan_title: title.trim() });
                setMsg("Saved.");
                reload();
              } catch (ex) { setMsg(ex instanceof Error ? ex.message : "failed"); }
              finally { setBusy(false); }
            }}>Save plan URL</Btn>
            {msg && <span role="status" className="text-tiny text-text-muted">{msg}</span>}
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle>Business plan <Badge tone="good">published</Badge></SectionTitle>
      <Card className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <a href={econ.business_plan.url} target="_blank" rel="noreferrer"
            className="text-small text-brand-success hover:underline">
            {econ.business_plan.title || econ.business_plan.url}
          </a>
          <Btn variant="fill" disabled={busy} onClick={async () => {
            setBusy(true); setMsg("");
            try {
              await api.putEconSettings({ team_id: econ.team_id,
                business_plan_url: url.trim() === (econ.business_plan.url ?? "") ? undefined : url.trim(),
                business_plan_title: title !== (econ.business_plan.title ?? "") ? title.trim() : undefined });
              setMsg("Updated.");
              reload();
            } catch (ex) { setMsg(ex instanceof Error ? ex.message : "failed"); }
            finally { setBusy(false); }
          }}>Update</Btn>
          {msg && <span role="status" className="text-tiny text-text-muted">{msg}</span>}
        </div>
        <div className="flex items-center gap-3 mt-3">
          <Field label="title"><input className={`${inputCls} w-64`} value={title}
            onChange={(e) => setTitle(e.target.value)} /></Field>
        </div>
      </Card>
    </section>
  );
}

"use client";

/**
 * Scripted, looping "alive" dashboard demo panel that overlaps the hero
 * gradient. Pure illustrative content — no statistics or percentages.
 * Timeline (framer-motion orchestration):
 *   0.0s  cursor moves to "Run" and clicks
 *   1.2s  steps tick in one by one (retrieve → attempt → test → verify)
 *   3.4s  dead end card slides in with red marker
 *   4.6s  fix card appears with green marker
 *   5.6s  confidence bar fills
 *   6.6s  cursor moves to Sharing tab; "Share with team" toggles ON
 *   9.4s  everything fades, timeline restarts
 */
import { motion, useAnimationControls, useAnimation } from "framer-motion";
import { useEffect, useState } from "react";

const SIDEBAR = ["Overview", "Memories", "Runs", "Agents", "Teams", "Sharing"];
const STEPS = [
  { label: "retrieve context", detail: "3 dead ends found" },
  { label: "attempt fix", detail: "patch catalog search" },
  { label: "verify", detail: "replay test passed" },
  { label: "record", detail: "memory updated" },
];

export function DashboardDemo() {
  const cursor = useAnimation();
  const [stepIdx, setStepIdx] = useState(0);
  const [showDeadEnd, setShowDeadEnd] = useState(false);
  const [showFix, setShowFix] = useState(false);
  const [barFill, setBarFill] = useState(0);
  const [tab, setTab] = useState<"Runs" | "Sharing">("Runs");
  const [shared, setShared] = useState(false);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      // reset
      setStepIdx(0); setShowDeadEnd(false); setShowFix(false);
      setBarFill(0); setTab("Runs"); setShared(false);
      cursor.set({ x: "calc(100% - 120px)", y: 260, opacity: 0 });

      const t = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
      t(600, () => cursor.start({ opacity: 1, transition: { duration: 0.3 } }));
      t(800, () => cursor.start({ x: 44, y: 250, transition: { type: "spring", duration: 0.9, bounce: 0.25 } }));
      t(1800, () => { /* clicked Run */ });
      t(2000, () => setStepIdx(1));
      t(2600, () => setStepIdx(2));
      t(3200, () => setStepIdx(3));
      t(3800, () => setStepIdx(4));
      t(4200, () => setShowDeadEnd(true));
      t(5400, () => setShowFix(true));
      t(6400, () => setBarFill(1));
      t(7200, () => cursor.start({ x: 44, y: 60, transition: { type: "spring", duration: 0.9, bounce: 0.25 } }));
      t(8100, () => setTab("Sharing"));
      t(8800, () => setShared(true));
      t(11200, () => cursor.start({ opacity: 0, transition: { duration: 0.4 } }));
      t(11800, run); // loop forever
    };
    run();
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative mx-auto max-w-6xl px-6 -mt-14 md:-mt-24 z-10">
      <div className="relative rounded-panel border border-line-800 bg-ink-900 shadow-2xl shadow-black/60 overflow-hidden">
        {/* fake window bar */}
        <div className="h-8 flex items-center px-3 gap-1.5 bg-ink-850 border-b border-line-900">
          <span className="w-2 h-2 rounded-full bg-ink-600" />
          <span className="w-2 h-2 rounded-full bg-ink-600" />
          <span className="w-2 h-2 rounded-full bg-ink-600" />
          <span className="ml-3 text-tiny text-text-muted font-mono">DeadEnd dashboard</span>
        </div>

        <div className="relative grid grid-cols-[180px_1fr_230px] min-h-[440px] text-left">
          {/* sidebar */}
          <aside className="border-r border-line-900 p-3 flex flex-col gap-1 bg-ink-850">
            {SIDEBAR.map((item) => (
              <button key={item}
                onClick={() => {}}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-cell text-small transition-colors ${
                  tab === item ? "bg-ink-700 text-text-primary" : "text-text-muted hover:text-text-secondary"
                }`}>
                {item}
                {item === "Sharing" && shared && (
                  <span className="text-tiny text-brand-success">✓</span>
                )}
              </button>
            ))}
            <div className="mt-auto text-tiny text-text-muted font-mono truncate">
              acme/catalog
            </div>
          </aside>

          {/* main */}
          <div className="p-5 relative">
            {tab === "Runs" ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-small font-medium">Run · fix catalog timezone sort</span>
                  <span className="pill-outline text-tiny px-2.5 py-0.5">Run</span>
                </div>
                {/* run steps */}
                <ol className="space-y-1.5 mb-5">
                  {STEPS.map((s, i) => (
                    <motion.li key={s.label}
                      initial={false}
                      animate={stepIdx > i ? { opacity: 1, x: 0 } : { opacity: 0.25, x: -6 }}
                      className="flex items-center gap-2.5 bg-ink-850 border border-line-900 rounded-cell px-3 py-2"
                    >
                      <StepMarker done={stepIdx > i} />
                      <span className="text-small text-text-secondary">{s.label}</span>
                      <span className="ml-auto text-tiny text-text-muted font-mono">
                        {stepIdx > i ? s.detail : "…"}
                      </span>
                    </motion.li>
                  ))}
                </ol>
                {/* dead end card (red marker) */}
                <motion.div initial={false}
                  animate={showDeadEnd ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
                  transition={{ type: "spring", duration: 0.6, bounce: 0.2 }}
                  className="flex items-start gap-2.5 bg-ink-850 border border-line-900 rounded-cell px-3 py-2.5 mb-2"
                >
                  <span className="mt-0.5 w-1.5 h-6 rounded-full bg-brand-danger shrink-0" />
                  <div>
                    <div className="text-small text-text-secondary">dead end · naive ORDER BY on mixed offsets</div>
                    <div className="text-tiny text-text-muted">mis-sorts rows across UTC offsets — abandoned</div>
                  </div>
                </motion.div>
                {/* fix card (green marker) */}
                <motion.div initial={false}
                  animate={showFix ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
                  transition={{ type: "spring", duration: 0.6, bounce: 0.2 }}
                  className="flex items-start gap-2.5 bg-ink-850 border border-line-900 rounded-cell px-3 py-2.5"
                >
                  <span className="mt-0.5 w-1.5 h-6 rounded-full bg-brand-success shrink-0" />
                  <div>
                    <div className="text-small text-text-secondary">fix · normalize to UTC before compare</div>
                    <div className="text-tiny text-text-muted">verified by replayed test — reuse ready</div>
                  </div>
                </motion.div>
              </>
            ) : (
              /* Sharing tab */
              <div className="h-full flex flex-col">
                <div className="text-small font-medium mb-4">Sharing</div>
                <ToggleRow label="Share with team" on={shared} onToggle={() => setShared((v) => !v)} />
                <ToggleRow label="Publish to global" on={false} onToggle={() => {}} />
                <p className="mt-4 text-tiny text-text-muted">
                  Nothing is shared without an explicit click.
                </p>
              </div>
            )}
          </div>

          {/* right details panel */}
          <aside className="border-l border-line-900 p-4 bg-ink-850 hidden md:block">
            <div className="text-tiny uppercase tracking-wider text-text-muted mb-3">Run details</div>
            <DetailRow k="agent" v="claude-code" />
            <DetailRow k="project" v="catalog" />
            <DetailRow k="attempt" v="#2" />
            <DetailRow k="context" v="retrieved" />
            <div className="mt-5 text-tiny uppercase tracking-wider text-text-muted mb-2">Confidence</div>
            <div className="h-2 rounded-full bg-ink-700 overflow-hidden">
              <motion.div className="h-full bg-brand-success"
                initial={false} animate={{ width: barFill ? "86%" : "8%" }}
                transition={{ duration: 0.9, ease: "easeOut" }} />
            </div>
            <div className="mt-2 text-tiny text-text-muted font-mono">learns from reuse</div>
            <div className="mt-5 flex flex-wrap gap-1.5">
              <Chip>verified</Chip>
              <Chip>redacted</Chip>
              <Chip>stored</Chip>
            </div>
          </aside>
        </div>

        {/* animated cursor overlay */}
        <motion.div className="absolute z-20 pointer-events-none"
          initial={{ x: "calc(100% - 120px)", y: 260, opacity: 0 }}
          animate={cursor}>
          <span className="absolute -top-9 left-4 pill-fill text-tiny px-2.5 py-0.5 whitespace-nowrap">
            {shared ? "Share with team ✓" : "Run ▸"}
          </span>
          <CursorGlyph />
        </motion.div>
      </div>

      {/* caption */}
      <p className="text-center text-tiny text-text-muted mt-4 mb-2">
        Illustrative demo of a recorded run — your dashboard, your runs.
      </p>
    </div>
  );
}

function StepMarker({ done }: { done: boolean }) {
  return done ? (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" className="text-brand-success" strokeWidth="1.4" />
      <path d="M4.4 7.2l1.8 1.8 3.4-4" stroke="currentColor" className="text-brand-success" strokeWidth="1.4"
        fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <span className="w-3.5 h-3.5 rounded-full border border-line-700 inline-block" />
  );
}

function DetailRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-line-900/60 last:border-0">
      <span className="text-tiny text-text-muted font-mono">{k}</span>
      <span className="text-tiny text-text-secondary font-mono">{v}</span>
    </div>
  );
}

function ToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between bg-ink-800 border border-line-900 rounded-cell px-3 py-2.5 mb-2">
      <span className="text-small text-text-secondary">{label}</span>
      <button onClick={onToggle} aria-label={label}
        className={`w-9 h-5 rounded-full relative transition-colors ${on ? "bg-brand-success/80" : "bg-ink-600"}`}>
        <motion.span layout className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ${on ? "right-0.5" : "left-0.5"}`}
          transition={{ type: "spring", duration: 0.4 }} />
      </button>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-tiny border border-line-800 rounded-chip px-2 py-0.5 text-text-muted">{children}</span>
  );
}

function CursorGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path d="M2 1.5l4.6 14 2.2-5.7 5.7-2.2z" fill="#fff" stroke="#0c0d10" strokeWidth="1.2" />
    </svg>
  );
}

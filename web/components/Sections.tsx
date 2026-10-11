"use client";

/** Content sections. Dark bordered cards, isometric SVG illustrations,
 * pill buttons, type scale — all styled from tokens via Tailwind theme. */
import { motion } from "framer-motion";
import { IllusLoop, IllusCapture, IllusTrace, IllusCheckpoint, IllusCost, IllusContext } from "./Illustrations";

/* shared card shell */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border border-line-800 rounded-card bg-ink-900 ${className}`}>
      {children}
    </div>
  );
}

function SectionHead({ title, sub, id }: { title: string; sub?: string; id?: string }) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-12" id={id}>
      <h2 className="text-h2 font-bold">{title}</h2>
      {sub && <p className="mt-3 text-body text-text-secondary">{sub}</p>}
    </div>
  );
}

export function WhyItMatters() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-section">
      <SectionHead
        title="Why it matters"
        sub="One agent burns 40 minutes and a pile of tokens on a bug, fixes it — and the knowledge dies with the session. The next engineer or agent repeats it."
      />
      <Card className="p-card">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="text-tiny uppercase tracking-widest text-text-muted mb-3">the problem</div>
            <h3 className="text-h3 font-bold mb-3">Solved once, paid for again and again.</h3>
            <p className="text-body text-text-secondary">
              DeadEnd keeps the dead ends <em>and</em> the fix: why each
              attempt failed, what finally worked, and the environment it
              worked in. The next agent starts past the loop.
            </p>
            <ul className="mt-5 space-y-2 text-small text-text-secondary">
              <li className="flex gap-2.5"><Dot red /> attempts that lead nowhere, and why</li>
              <li className="flex gap-2.5"><Dot green /> the fix that actually verified — replayed</li>
              <li className="flex gap-2.5"><Dot /> full fidelity in private, redacted in global</li>
            </ul>
          </div>
          <IllusLoop />
        </div>
      </Card>
    </section>
  );
}

function Dot({ red, green }: { red?: boolean; green?: boolean }) {
  return (
    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
      red ? "bg-brand-danger" : green ? "bg-brand-success" : "bg-line-700"}`} />
  );
}

/* --------------------------------------------------- how it works stepper */

const STEPS = [
  { n: "01", title: "Your agent works as usual", body: "No new workflow. It writes code, runs tests, commits — DeadEnd watches quietly." },
  { n: "02", title: "Attempts get captured", body: "Every failed attempt, why it failed, and the fix that worked become a structured memory, not a scrolling transcript." },
  { n: "03", title: "Scanned and verified", body: "Secrets and prompt injections are scanned out and quarantine catches anything suspicious; the fix is replayed to prove it works." },
  { n: "04", title: "Next agent starts ahead", body: "Retrieved by signature and ranked by confidence, the dead ends and constraints arrive before the first attempt — in chat, in CLAUDE.md/AGENTS.md blocks, or over MCP." },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-line-900 bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-6 py-section">
        <SectionHead title="How it works" sub="Four steps, no change to how your agents already run." />
        <div className="grid md:grid-cols-4 gap-4">
          {STEPS.map((s, i) => (
            <motion.div key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
            >
              <Card className="p-6 h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono text-tiny text-text-muted">{s.n}</span>
                  <StepAnim i={i} />
                </div>
                <div className="text-h3 font-bold mb-2">{s.title}</div>
                <p className="text-small text-text-secondary">{s.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>
        {/* connector line on desktop */}
        <div className="hidden md:block relative h-px bg-line-800 mx-8 mt-8" aria-hidden />
      </div>
    </section>
  );
}

function StepAnim({ i }: { i: number }) {
  const common = "h-6 w-24";
  if (i === 0) { // agent working: typing cursor
    return (
      <div className={`${common} border border-line-900 rounded-cell px-2 flex items-center`}>
        <span className="text-tiny font-mono text-text-muted">run ▸</span>
        <motion.span className="ml-1 w-1.5 h-3 bg-text-muted"
          animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 1.1 }} />
      </div>
    );
  }
  if (i === 1) { // capture: rows sliding
    return (
      <div className={`${common} border border-line-900 rounded-cell overflow-hidden`}>
        <motion.div className="h-2 bg-ink-700 mx-1 mt-1 rounded-sm"
          animate={{ x: [-10, 0] }} transition={{ repeat: Infinity, repeatType: "reverse", duration: 1.6 }} />
        <div className="h-2 bg-ink-750 mx-1 mt-1 rounded-sm" />
      </div>
    );
  }
  if (i === 2) { // scan: pulse
    return (
      <div className={`${common} border border-line-900 rounded-cell flex items-center justify-center`}>
        <motion.span className="w-2 h-2 rounded-full bg-brand-danger"
          animate={{ scale: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} />
        <span className="mx-2 text-tiny text-text-muted">quarantine</span>
        <span className="w-2 h-2 rounded-full bg-brand-success" />
      </div>
    );
  }
  // handoff: arrow pulsing right
  return (
    <div className={`${common} border border-line-900 rounded-cell flex items-center justify-center`}>
      <svg width="60" height="10" aria-hidden>
        <motion.path d="M0 5h48 m0 0l-5-3m5 3l-5 3" stroke="#4ade80" strokeWidth="1.4" fill="none"
          animate={{ x: [-6, 4, -6] }} transition={{ repeat: Infinity, duration: 2 }} />
      </svg>
    </div>
  );
}

/* -------------------------------------------------------- under the hood */

const ROWS = [
  {
    name: "neatlogs",
    line: "Every run, traced.",
    body: "Each agent run becomes a trace. DeadEnd finds the failing step, with its cause, and that failure feeds the memory.",
    without: "A wall of console output; nobody knows which step actually failed or why.",
    with_: "The failing step and its cause are located for you; the memory writes itself.",
    Illus: IllusTrace,
  },
  {
    name: "Entire",
    line: "Every change, with its reasoning.",
    body: "Each commit is checkpointed with the prompts and decisions behind it — a stored fix always links back to how it was made. Repos hold your private and shared context.",
    without: "A diff in git history, divorced from the thought process that produced it.",
    with_: "Checkpoint, prompts and diff travel together; your private context repo mirrors it.",
    Illus: IllusCheckpoint,
  },
  {
    name: "cfo.ai",
    line: "Know what it costs.",
    body: "The cost of a run and the saving from reusing a fix feed a business plan: pricing, margin and runway.",
    without: "Agent spend is a vague cloud number nobody can tie to value.",
    with_: "Run cost and reuse saving are visible enough to build a plan around.",
    Illus: IllusCost,
  },
];

export function UnderTheHood() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-section">
      <SectionHead title="Under the hood" sub="Three tools do the quiet work — DeadEnd turns their output into memory you can reuse." />
      <div className="space-y-6">
        {ROWS.map((r, i) => (
          <Card key={r.name} className="overflow-hidden">
            <div className={`grid md:grid-cols-2 items-center ${i % 2 ? "md:[direction:rtl]" : ""}`}>
              <div className="p-card [direction:ltr]">
                <div className="text-tiny font-mono text-text-muted mb-2">{r.name}</div>
                <h3 className="text-h3 font-bold mb-3">{r.line}</h3>
                <p className="text-body text-text-secondary mb-5">{r.body}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Mini label="Without DeadEnd" tone="bad" text={r.without} />
                  <Mini label="With DeadEnd" tone="good" text={r.with_} />
                </div>
              </div>
              <div className="p-6 [direction:ltr]"><r.Illus /></div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Mini({ label, tone, text }: { label: string; tone: "bad" | "good"; text: string }) {
  return (
    <div className={`rounded-cell border px-3 py-2.5 ${tone === "bad" ? "border-line-800 bg-ink-850" : "border-line-800 bg-ink-850"}`}>
      <div className={`text-tiny font-medium mb-1 ${tone === "bad" ? "text-brand-danger" : "text-brand-success"}`}>{label}</div>
      <div className="text-tiny text-text-secondary">{text}</div>
    </div>
  );
}

/* ------------------------------------------------- private/global cards */

export function Context() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-section">
      <SectionHead title="Private and global context" sub="Two circles of memory, one boundary you control." />
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="p-card">
          <h3 className="text-h3 font-bold mb-2">Private</h3>
          <p className="text-body text-text-secondary mb-4">
            Shared only with your team, full detail kept: attempts, reasons,
            recipe, environment.
          </p>
          <IllusContext small />
        </Card>
        <Card className="p-card">
          <h3 className="text-h3 font-bold mb-2">Global</h3>
          <p className="text-body text-text-secondary mb-4">
            Opt-in, redacted, verified fixes shared with everyone — ranked by
            confidence learned from real reuse.
          </p>
          <IllusContext small />
        </Card>
      </div>
      <div className="mt-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between text-tiny font-mono text-text-muted px-1">
          <span>verified</span><span>redacted</span><span>you approve the diff</span><span>published</span>
        </div>
        <div className="mt-2 h-px bg-line-800 relative">
          {[0, 33.3, 66.6, 100].map((p, i) => (
            <motion.span key={p} className="absolute -top-1 w-2 h-2 rounded-full bg-text-secondary"
              style={{ left: `calc(${p}% - 4px)` }}
              initial={{ scale: 0 }} whileInView={{ scale: 1 }}
              viewport={{ once: true }} transition={{ delay: i * 0.15 }} />
          ))}
        </div>
        <p className="mt-4 text-center text-small text-text-muted">
          Nothing is shared without an explicit click — promotion shows you
          the diff first.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- features */

const FEATURES = [
  ["Dead-end memory", "The reason each attempt failed, attached to the fix that worked."],
  ["Confidence that learns", "Ranked by reuse outcomes, environment match and recency — not vibes."],
  ["Replay verification", "A fix is only trusted after its test passes again."],
  ["Secret & injection scanning", "Quarantine catches secrets and prompt-injection patterns before storage."],
  ["Team sharing with roles", "Owner/admin/member roles on every private entry."],
  ["Per-agent comparison", "Runs, success rate, tokens and time — with and without context."],
  ["VS Code extension", "Run agents, watch steps live, accept or revert — from the editor."],
  ["MCP server", "Any MCP-capable agent can retrieve and record through deadend-mcp."],
  ["GitHub sign-in", "One identity provider; no extra passwords anywhere."],
];

export function Features() {
  return (
    <section id="features" className="border-y border-line-900 bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-6 py-section">
        <SectionHead title="Features" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(([t, b], i) => (
            <motion.div key={t}
              initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }} transition={{ delay: (i % 3) * 0.06 }}>
              <Card className="p-6 h-full">
                <div className="text-h3 font-bold mb-1.5 text-[17px]">{t}</div>
                <p className="text-small text-text-secondary">{b}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------- small avatar embeds for Context ---------- */
declare module "./Illustrations" {}

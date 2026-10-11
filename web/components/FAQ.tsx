"use client";

/** FAQ: six short, honest answers. Footer per spec. */
import { useState } from "react";
import { DeadEndMark } from "./Nav";

const QA = [
  {
    q: "What exactly is stored?",
    a: "A structured memory: the error signature, each failed attempt and why it failed, the verified fix, your environment fingerprint, and the provenance (trace and checkpoint references).",
  },
  {
    q: "Who can see my runs?",
    a: "Only your team, until something is promoted. Global sharing is opt-in, redacted, and requires you to approve the exact diff before it is published.",
  },
  {
    q: "How are secrets handled?",
    a: "Every stored digit is scanned for secret patterns and prompt-injection strings. Anything suspicious is quarantined, never written. Service-side redaction strips connection strings and bearer tokens before anything is shared.",
  },
  {
    q: "Which agents does it work with?",
    a: "Claude Code, Codex, OpenCode, Pi, Antigravity CLI and Copilot CLI — headless runner adapters, an MCP server for agents that run by hand, plus the VS Code extension.",
  },
  {
    q: "What does it cost to run?",
    a: "The runner and MCP server run on your machine; the retrieval Rochester runs on the deployed backend. Agent spend is your own plan's; cfo.ai reporting makes run cost and reuse savings visible.",
  },
  {
    q: "How do I leave?",
    a: "Revoke your API token, delete team entries, and stop the runner — no data leaves your machine once integrated tooling is removed.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-section">
      <h2 className="text-h2 font-bold text-center mb-10">Questions</h2>
      <div className="space-y-2">
        {QA.map((item, i) => (
          <div key={i} className="border border-line-800 rounded-card bg-ink-900 overflow-hidden">
            <button onClick={() => setOpen(open === i ? -1 : i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left">
              <span className="text-body font-medium">{item.q}</span>
              <span className={`text-text-muted transition-transform ${open === i ? "rotate-45" : ""}`}>＋</span>
            </button>
            {open === i && (
              <p className="px-5 pb-4 text-small text-text-secondary">{item.a}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function Footer() {
  const COLS: Record<string, { label: string; href: string }[]> = {
    Product: [
      { label: "Features", href: "#features" },
      { label: "How it works", href: "#how" },
      { label: "Platforms", href: "#platforms" },
      { label: "Download", href: "#download" },
    ],
    Developers: [
      { label: "Docs", href: "/docs" },
      { label: "MCP server", href: "#features" },
      { label: "Runner", href: "#download" },
      { label: "SUPPORT.md", href: "/SUPPORT.md" },
    ],
    Company: [
      { label: "GitHub repo", href: "https://github.com/gowthamchoudhary/DeadEnd" },
      { label: "neatlogs", href: "#hood" },
      { label: "Contact", href: "mailto:hello@deadend.dev" },
    ],
  };
  return (
    <footer className="border-t border-line-900 bg-ink-950">
      <div className="mx-auto max-w-6xl px-6 py-14 grid md:grid-cols-[1.6fr_1fr_1fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-2 font-semibold text-[17px]">
            <DeadEndMark /> DeadEnd
          </div>
          <p className="mt-3 text-small text-text-muted max-w-xs">
            Every dead end remembered, every fix earned once.
          </p>
          <p className="mt-6 text-tiny text-text-muted">Built for neatHack.</p>
        </div>
        {Object.entries(COLS).map(([title, links]) => (
          <div key={title}>
            <div className="text-tiny uppercase tracking-widest text-text-muted mb-3">{title}</div>
            <ul className="space-y-2">
              {links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-small text-text-secondary hover:text-text-primary transition-colors">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}

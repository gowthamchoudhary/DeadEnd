"use client";

/** Platforms strip — dark bordered logo grid, 6 cells, separated by
 * inner 1px borders like the reference. Logos live at
 * /public/logos/<agent>.svg or .png; falls back to name-only if missing. */
import { useMemo } from "react";

const AGENTS = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "opencode", name: "OpenCode" },
  { id: "pi", name: "Pi" },
  { id: "antigravity", name: "Antigravity CLI" },
  { id: "copilot-cli", name: "Copilot CLI" },
];

const EXT_OK = [".svg", ".png", ".webp"];

function useLogoPaths() {
  return useMemo(
    () =>
      AGENTS.map((a) => ({
        ...a,
        candidates: EXT_OK.map((ext) => `/logos/${a.id}${ext}`),
      })),
    []
  );
}

export function Platforms() {
  const agents = useLogoPaths();
  return (
    <>
      <div className="hatch mt-16 md:mt-24" aria-hidden />
      <section id="platforms" className="bg-ink-950 border-b border-line-900">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-h2 font-bold">
            Works with the agents you already use.
          </h2>
          <p className="text-center text-small text-text-muted mt-3 max-w-md mx-auto">
            Same machine, same credentials, nothing new to manage.
          </p>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-3 border border-line-800 rounded-card overflow-hidden bg-ink-900">
            {agents.map((a, i) => (
              <div key={a.id}
                className={`flex items-center justify-center gap-2.5 h-24 border-line-800 ${
                  i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b md:border-b-0" : ""} 
                  ${i === 0 ? "md:border-r" : ""} ${i === 1 ? "md:border-r" : ""}`}
              >
                <PlatformCell name={a.name} candidates={a.candidates} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

import { useState } from "react";

function PlatformCell({ name, candidates }: { name: string; candidates: string[] }) {
  const [srcIdx, setSrcIdx] = useState(0);
  // try each candidate path; if all fail, render the name only
  if (srcIdx >= candidates.length) {
    return <span className="text-small text-text-secondary font-medium">{name}</span>;
  }
  return (
    <span className="flex items-center gap-2.5 text-small text-text-secondary font-medium">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidates[srcIdx]}
        alt=""
        width={22}
        height={22}
        className="opacity-80"
        onError={() => setSrcIdx((i) => i + 1)}
      />
      <span className="opacity-90">{name}</span>
    </span>
  );
}

"use client";

/** Platforms band — the reference's bare logo grid: a full-width dark band
 * with hairline dividers between cells and no heading. Logos live at
 * /public/logos/<agent>.svg | .png | .webp; falls back to name-only. */
import { useMemo, useState } from "react";

const AGENTS = [
  { id: "claude-code", name: "Claude Code" },
  { id: "codex", name: "Codex" },
  { id: "opencode", name: "OpenCode" },
  { id: "pi", name: "Pi" },
  { id: "antigravity", name: "Antigravity CLI" },
  { id: "copilot-cli", name: "Copilot CLI" },
];

const EXT_OK = [".svg", ".png", ".webp"];

export function Platforms() {
  const agents = useMemo(
    () => AGENTS.map((a) => ({ ...a, candidates: EXT_OK.map((ext) => `/logos/${a.id}${ext}`) })),
    []
  );
  return (
    <>
      <div className="hatch mt-16 md:mt-24" aria-hidden />
      <section id="platforms" className="bg-ink-950 border-b border-line-900">
        <div className="mx-auto max-w-5xl px-6 py-12">
          {/* hairline grid: outer top/left on the container, right/bottom per cell */}
          <div className="grid grid-cols-2 md:grid-cols-3 border-t border-l border-line-800/70">
            {agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-center gap-2.5 h-24 border-r border-b border-line-800/70"
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

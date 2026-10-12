"use client";

/** Dashboard sidebar — the eight sections, with the active route marked.
 * Real anchors (keyboard + middle-click friendly), focus-visible ring from
 * globals.css. On mobile it renders as a drawer owned by the shell. */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DeadEndMark } from "@/components/Nav";

const ICONS: Record<string, string> = {
  overview: "M3 3h7v7H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 14h7v7H3z",
  memories: "M4 4h11l5 5v11H4zM15 4v5h5",
  runs: "M5 3l14 9-14 9z",
  agents: "M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2M7 7h10v10H7z",
  teams: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M17 11a3 3 0 1 0 0-6M16 20h6a5 5 0 0 0-4-4.9",
  sharing: "M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v13M8 7l4-4 4 4",
  quarantine: "M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6zM12 9v4M12 16h.01",
  economics: "M4 20h16M6 16v-6M11 16V7M16 16v-4M21 16v-9",
  settings: "M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6",
};

export const NAV = [
  { href: "/app", label: "Overview", icon: ICONS.overview },
  { href: "/app/memories", label: "Memories", icon: ICONS.memories },
  { href: "/app/runs", label: "Runs", icon: ICONS.runs },
  { href: "/app/agents", label: "Agents", icon: ICONS.agents },
  { href: "/app/teams", label: "Teams", icon: ICONS.teams },
  { href: "/app/sharing", label: "Sharing", icon: ICONS.sharing },
  { href: "/app/quarantine", label: "Quarantine", icon: ICONS.quarantine },
  { href: "/app/economics", label: "Economics", icon: ICONS.economics },
  { href: "/app/settings", label: "Settings", icon: ICONS.settings },
] as const;

function Item({ href, label, icon, active }: {
  href: string; label: string; icon: string; active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-cell px-3 py-2 text-small transition-colors ${
        active ? "bg-ink-800 text-text-primary" : "text-text-muted hover:text-text-secondary hover:bg-ink-900"
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={icon} />
      </svg>
      {label}
    </Link>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <>
      {/* mobile scrim */}
      {open && (
        <button aria-label="Close menu" onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 md:hidden" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 border-r border-line-900 bg-ink-950
                    p-3 flex flex-col transition-transform md:static md:translate-x-0
                    ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Link href="/" className="flex items-center gap-2 font-semibold px-3 py-2 mb-3">
          <DeadEndMark /> DeadEnd
        </Link>
        <nav className="space-y-0.5" aria-label="Dashboard">
          {NAV.map((n) => (
            <div key={n.href} onClick={onClose}>
              <Item {...n} active={isActive(n.href)} />
            </div>
          ))}
        </nav>
        <div className="mt-auto px-3 py-3 text-tiny text-text-muted">
          runner &amp; MCP run on your machine
        </div>
      </aside>
    </>
  );
}

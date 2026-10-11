"use client";

/** Top bar: team switcher (names come from GET /teams), project filter
 * (scoped to the active team's projects), a search box that drives the
 * Memories search, and the user menu. Mobile: hamburger + compact controls. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTeam } from "@/lib/team";
import { Select, inputCls } from "./ui";

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { me, teams, teamId, team, selectTeam, projects, projectFilter, setProjectFilter,
    setSearch } = useTeam();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* Escape closes the user menu; clicking away closes it too. */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [menuOpen]);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setSearch(q.trim());
    router.push("/app/memories");
  }

  const role = team?.role ?? "member";

  return (
    <header className="sticky top-0 z-20 border-b border-line-900 bg-ink-950/90 backdrop-blur">
      <div className="flex items-center gap-2 px-3 md:px-5 h-nav">
        <button onClick={onOpenMenu} aria-label="Open navigation"
          className="md:hidden rounded-chip border border-line-800 px-2 py-1.5 text-small">
          ☰
        </button>

        {/* team switcher */}
        <div className="flex items-center gap-2 min-w-0">
          <Select
            aria-label="Active team"
            value={teamId}
            onChange={(e) => selectTeam(e.target.value)}
            className="max-w-[9rem] md:max-w-[12rem]"
          >
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>{t.name}</option>
            ))}
          </Select>
          <span className="hidden lg:inline text-tiny text-text-muted border border-line-800 rounded-chip px-1.5 py-0.5">
            {role}
          </span>
        </div>

        {/* project filter */}
        <Select aria-label="Filter by project" value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="hidden sm:block max-w-[9rem] md:max-w-[11rem]">
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.project_id} value={p.project_id}>{p.name}</option>
          ))}
        </Select>

        {/* search → Memories */}
        <form onSubmit={onSearch} role="search" className="ml-auto flex items-center gap-2">
          <label htmlFor="dash-search" className="sr-only">Search memories</label>
          <input
            id="dash-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setSearch(""); } }}
            placeholder="Search memories…"
            className={`${inputCls} hidden md:block w-40 lg:w-56`}
          />
          <button type="submit" className="sr-only">Search</button>
        </form>

        {/* user menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Account menu"
            className="flex items-center gap-2 rounded-full border border-line-800 px-2 py-1.5 hover:border-line-700 transition-colors"
          >
            {me.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.avatar_url} alt="" width={20} height={20} className="rounded-full" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-ink-700 inline-block" />
            )}
            <span className="hidden md:inline text-small text-text-secondary">{me.login}</span>
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 mt-2 w-48 border border-line-800 rounded-card bg-ink-900 p-1.5 shadow-xl shadow-black/50">
              <div className="px-3 py-2 text-tiny text-text-muted truncate">{me.login}</div>
              <a role="menuitem" href="/app/settings"
                className="block px-3 py-1.5 rounded-cell text-small text-text-secondary hover:bg-ink-850">
                Settings
              </a>
              <a role="menuitem" href="/signout"
                className="block px-3 py-1.5 rounded-cell text-small text-text-secondary hover:bg-ink-850">
                Sign out
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

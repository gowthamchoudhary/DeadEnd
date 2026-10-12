"use client";

/** Nav — matches reference: mark left, centred links, Login outline +
 * Sign up fill. Sits over the light hero gradient, so every element is
 * dark-on-light. Both buttons go to GitHub sign-in (backend proxy). */
import Link from "next/link";

export function DeadEndMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* dead-end road: path that stops at a wall + flag detour */}
      <path d="M3 21V11a4 4 0 0 1 4-4h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 21h2" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M13 7l-3-3.5M13 7l-3 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="15" y="1.5" width="7" height="6" rx="1.4" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#platforms", label: "Platforms" },
  { href: "/docs/getting-started", label: "Docs" },
  { href: "#download", label: "Download" },
];

const AUTH_HREF = "/api/auth/github";

export function Nav() {
  return (
    <header className="absolute top-0 left-0 right-0 z-30">
      <div className="mx-auto max-w-6xl px-6 h-nav flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[17px] tracking-tight text-ink-950">
          <DeadEndMark />
          DeadEnd
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-small text-ink-950/70">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-ink-950 transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a href={AUTH_HREF} className="rounded-full border border-ink-950/25 text-ink-950 text-small px-4 py-1.5 hover:border-ink-950/50 hover:bg-ink-950/5 transition-colors">
            Login
          </a>
          <a href={AUTH_HREF} className="pill-fill text-small px-4 py-1.5 font-medium">
            Sign up
          </a>
        </div>
      </div>
    </header>
  );
}

"use client";

/** Hero — full-bleed mesh gradient matched to the reference: lavender on the
 * left, a bright cream/peach core top-centre, deep blue/navy on the right,
 * fading to ink where the dashboard panel overlaps the bottom edge.
 * Type is dark on the light gradient (CSS in globals.css for the grain). */
import { motion } from "framer-motion";
// direct VSIX download — the same constant the Download section bakes in
// (components/Download.tsx: version/size/sha256, set at package time)
import { VSIX_RELEASE_URL } from "./Download";

const AUTH_HREF = "/api/auth/github";
const DOWNLOAD_HREF = VSIX_RELEASE_URL;

/** Painted top → bottom: overlays first, ink base last. */
const MESH = [
  // bottom edge softens into the dark band the panel overlaps
  "linear-gradient(180deg, transparent 90%, rgba(12,13,16,0.75) 100%)",
  // navy on the far right, over the blues
  "radial-gradient(78% 96% at 98% 58%, #131b45 0%, transparent 70%)",
  "radial-gradient(56% 68% at 84% 26%, var(--g-blue-deep) 0%, transparent 66%)",
  "radial-gradient(42% 54% at 67% 6%, var(--g-blue) 0%, transparent 72%)",
  // warm core
  "radial-gradient(46% 56% at 47% 20%, var(--g-cream) 0%, transparent 74%)",
  "radial-gradient(40% 48% at 35% 34%, var(--g-peach-warm) 0%, transparent 76%)",
  // lavender on the left where the headline sits
  "radial-gradient(58% 82% at 5% 54%, var(--g-lavender) 0%, transparent 72%)",
  "radial-gradient(44% 50% at 20% 3%, var(--g-lavender-soft) 0%, transparent 78%)",
  "var(--ink-950)",
].join(",");

export function Hero() {
  return (
    <section className="relative grain overflow-hidden">
      <div className="absolute inset-0" aria-hidden style={{ background: MESH }} />

      <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-16 md:pt-40 md:pb-24">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl"
        >
          <h1 className="font-grotesk text-display text-ink-950">
            <span className="font-bold block">Stop repeating</span>
            <span className="font-normal block text-ink-950/85">
              each other&apos;s mistakes.
            </span>
          </h1>
          <p className="mt-5 text-body text-ink-950/75 max-w-md font-medium">
            DeadEnd remembers every failed attempt and the fix that finally
            worked, so the next agent starts past the dead ends.
          </p>
          <div className="mt-7 flex items-center gap-3">
            <a href={AUTH_HREF} className="pill-fill px-5 py-2 text-small font-medium flex items-center gap-1.5">
              Get started
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href={DOWNLOAD_HREF}
              download
              className="rounded-full border border-ink-950/25 text-ink-950 px-5 py-2 text-small transition-colors hover:border-ink-950/50 hover:bg-ink-950/5"
            >
              Download extension
            </a>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

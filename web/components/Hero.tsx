"use client";

/** Hero — soft blue / lavender / peach gradient on dark ink with film
 * grain (CSS in globals.css). Headline copy is ours. The dark dashboard
 * panel below overlaps the gradient via negative margin (DashboardDemo). */
import { motion } from "framer-motion";
import { DeadEndMark } from "./Nav";

const AUTH_HREF = "/api/auth/github";
// direct VSIX download (see components/Download.tsx for version/size/sum)
const DOWNLOAD_HREF = "/downloads/deadend-0.1.0.vsix";
const DOWNLOAD_ATTR = true;

export function Hero() {
  return (
    <section className="relative grain overflow-hidden">
      {/* gradient layers (blurred radials on ink) */}
      <div className="absolute inset-0" aria-hidden>
        <div
          className="absolute inset-0"
          style={{
            background: [
              "radial-gradient(46% 52% at 18% 30%, var(--g-lavender) 0%, transparent 100%)",
              "radial-gradient(38% 46% at 30% 14%, var(--g-peach-warm) 0%, transparent 100%)",
              "radial-gradient(30% 42% at 82% 20%, var(--g-blue) 0%, transparent 100%)",
              "radial-gradient(24% 30% at 58% 8%, var(--g-cream) 0%, transparent 100%)",
              "radial-gradient(120% 90% at 50% 0%, transparent 40%, var(--ink-950) 100%)",
            ].join(","),
          }}
        />
        {/* dark vignette top corners like reference */}
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(12,13,16,0.35) 0%, transparent 30%)" }} />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-2 md:pt-40">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-xl"
        >
          <h1 className="font-grotesk font-bold text-display text-text-primary">
            Your agents stop repeating each&nbsp;other&apos;s mistakes.
          </h1>
          <p className="mt-4 text-body text-ink-950/85 max-w-md font-medium">
            DeadEnd remembers every failed attempt and the fix that finally
            worked, so the next agent starts past the dead ends.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <a href={AUTH_HREF} className="pill-fill px-5 py-2 text-small font-medium flex items-center gap-1.5">
              Get started
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href={DOWNLOAD_HREF} download={DOWNLOAD_ATTR} className="pill-outline px-5 py-2 text-small">
              Download extension
            </a>
          </div>
          {/* wordmark echo for balance, per reference logo placement */}
          <div className="mt-8 flex items-center gap-1.5 text-ink-950/70">
            <DeadEndMark size={16} />
            <span className="text-tiny font-medium tracking-wide">DEADEND</span>
          </div>
        </motion.div>

        {/* spacer that the dashboard panel will overlap */}
        <div className="h-16 md:h-24" />
      </div>
    </section>
  );
}

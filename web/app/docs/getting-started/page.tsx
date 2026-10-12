import type { Metadata } from "next";
import Link from "next/link";
import { DeadEndMark } from "@/components/Nav";
import { GettingStartedDoc } from "@/components/GettingStarted";

export const metadata: Metadata = {
  title: "Getting started — DeadEnd",
  description:
    "Install the VS Code extension, connect the runner, enable neatlogs and Entire, and capture your first reusable memory.",
};

export default function GettingStartedDocsPage() {
  return (
    <main className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-20 border-b border-line-900 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 h-nav flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-text-primary">
            <DeadEndMark /> DeadEnd
            <span className="text-text-muted font-normal">/ docs</span>
          </Link>
          <div className="flex items-center gap-3">
            <a href="/login"
              className="rounded-full border border-line-700 text-text-secondary text-small px-4 py-1.5 hover:border-line-600 hover:text-text-primary transition-colors">
              Login
            </a>
            <a href="/api/auth/github" className="pill-fill text-small px-4 py-1.5 font-medium">
              Sign up
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-section">
        <div className="text-tiny uppercase tracking-widest text-text-muted mb-3">docs</div>
        <h1 className="text-h2 font-bold mb-3">Getting started</h1>
        <p className="text-body text-text-secondary mb-10">
          Ten steps from zero to a memory your next agent reuses. Every command
          below is copy-paste, and every claim is what the product actually
          does — nothing here is aspirational.
        </p>

        <GettingStartedDoc />

        <footer className="mt-16 pt-8 border-t border-line-900 flex flex-wrap items-center justify-between gap-4 text-tiny text-text-muted">
          <Link href="/" className="hover:text-text-secondary transition-colors">
            ← Back to the landing page
          </Link>
          <span>Every dead end remembered, every fix earned once.</span>
        </footer>
      </div>
    </main>
  );
}

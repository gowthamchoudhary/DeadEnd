"use client";

/** Download section — VSIX served from this site's /downloads with the
 * HTML download attribute. Version + size + SHA-256 are baked in by
 * scripts/copy-vsix.sh at package time (see inline constants). The
 * self-contained sources of truth are the copies in /downloads. */
export const VSIX_RELEASE_URL = "/downloads/deadend-0.3.1.vsix";
export const VSIX_SHA256 = "de4dd931b62671ed3cacae1f31d9dccf6f61acac0ccb14581cfaf43262411c0a";
export const VSIX_SIZE = "38 KB";
export const VSIX_VERSION = "0.3.1";

export function Download() {
  return (
    <section id="download">
      <div className="border-y border-line-900 bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-6 py-section grid md:grid-cols-2 gap-8 items-center">
        <div>
          <div className="text-tiny uppercase tracking-widest text-text-muted mb-3">vs code</div>
          <h2 className="text-h2 font-bold mb-4">Run agents from your editor.</h2>
          <ol className="space-y-3 text-body text-text-secondary list-none">
            <li className="flex gap-3"><Num n={1} />Download <code className="font-mono text-text-primary">deadend-{VSIX_VERSION}.vsix</code> below.</li>
            <li className="flex gap-3"><Num n={2} />Extensions → <strong>⋯</strong> → <strong>Install from VSIX…</strong></li>
            <li className="flex gap-3"><Num n={3} />Command palette → <strong>DeadEnd: Sign in</strong> (GitHub).</li>
          </ol>
          <div className="mt-6 flex items-center gap-3">
            {/* download attribute = direct file download, no navigation */}
            <a href={VSIX_RELEASE_URL} download
              className="pill-fill px-5 py-2 text-small font-medium">
              Download extension
            </a>
            <a href="#platforms" className="pill-outline px-5 py-2 text-small">Supported agents</a>
            <a href="/docs/getting-started" className="pill-outline px-5 py-2 text-small">Getting started guide</a>
          </div>
          <p className="mt-3 text-tiny text-text-muted font-mono">
            v{VSIX_VERSION} · {VSIX_SIZE} · sha256 {VSIX_SHA256.slice(0, 16)}…
          </p>
        </div>
        <div className="border border-line-800 rounded-card bg-ink-900 p-6">
          <div className="text-tiny text-text-muted mb-3 font-mono">runner install (per repo README)</div>
          <pre className="font-mono text-tiny text-text-secondary overflow-x-auto bg-ink-950 border border-line-900 rounded-cell p-4 leading-relaxed">{`pipx install git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner

# or
pip install --user \\\\
  "deadend-runner @ git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner"

# verify
deadend-runner agents`}</pre>
        </div>
      </div>
      </div>
    </section>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-line-700 text-tiny text-text-muted flex items-center justify-center font-mono">
      {n}
    </span>
  );
}

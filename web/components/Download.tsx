"use client";

/** Download section — VSIX + runner install. The link target is a single
 * constant you will set to the GitHub release URL. */
export const VSIX_RELEASE_URL =
  "https://github.com/gowthamchoudhary/DeadEnd/releases/latest/download/deadend-0.1.0.vsix";

export function Download() {
  return (
    <section id="download">
      <div className="border-y border-line-900 bg-ink-900/40">
      <div className="mx-auto max-w-6xl px-6 py-section grid md:grid-cols-2 gap-8 items-center">
        <div>
          <div className="text-tiny uppercase tracking-widest text-text-muted mb-3">vs code</div>
          <h2 className="text-h2 font-bold mb-4">Run agents from your editor.</h2>
          <ol className="space-y-3 text-body text-text-secondary list-none">
            <li className="flex gap-3"><Num n={1} />Download <code className="font-mono text-text-primary">deadend-0.1.0.vsix</code> below.</li>
            <li className="flex gap-3"><Num n={2} />Extensions → <strong>⋯</strong> → <strong>Install from VSIX…</strong></li>
            <li className="flex gap-3"><Num n={3} />Command palette → <strong>DeadEnd: Sign in</strong> (GitHub).</li>
          </ol>
          <div className="mt-6 flex items-center gap-3">
            <a href={VSIX_RELEASE_URL} className="pill-fill px-5 py-2 text-small font-medium">
              Download extension
            </a>
            <a href="#platforms" className="pill-outline px-5 py-2 text-small">Supported agents</a>
          </div>
        </div>
        <div className="border border-line-800 rounded-card bg-ink-900 p-6">
          <div className="text-tiny text-text-muted mb-3 font-mono">runner install (per repo README)</div>
          <pre className="font-mono text-tiny text-text-secondary overflow-x-auto bg-ink-950 border border-line-900 rounded-cell p-4 leading-relaxed">{`pipx install git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner

# or
pip install --user \\
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

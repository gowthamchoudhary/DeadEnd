"use client";

/** Getting-started guide content — the ten steps from zero to a reused
 * memory, plus troubleshooting. Every command is copy-paste; every claim
 * is what the shipped product actually does (extension commands from
 * extension/package.json, per-agent login lines from SUPPORT.md, status
 * strings from extension/src/auth.ts). Shared with /app/getting-started
 * via <Copyable>. */
import { useState } from "react";
import { VSIX_RELEASE_URL, VSIX_SHA256, VSIX_SIZE, VSIX_VERSION } from "./Download";

/** Command with a copy button. Block form for multi-line/shell blocks;
 * inline form for single commands shown inside a row. */
export function Copyable({ text, inline }: { text: string; inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  if (inline) {
    return (
      <span className="flex items-center gap-2 bg-ink-850 border border-line-900 rounded-cell pl-3 pr-1 py-1 max-w-full">
        <code className="font-mono text-tiny text-text-secondary truncate">{text}</code>
        <button onClick={copy}
          className="rounded-chip border border-line-700 px-2 py-0.5 text-tiny text-text-secondary hover:border-line-600 hover:text-text-primary transition-colors shrink-0">
          {copied ? "copied ✓" : "copy"}
        </button>
      </span>
    );
  }
  return (
    <div className="relative mt-3">
      <pre className="font-mono text-tiny text-text-secondary bg-ink-850 border border-line-900 rounded-cell p-3 pr-16 overflow-x-auto">{text}</pre>
      <button onClick={copy}
        className="absolute top-2 right-2 rounded-chip border border-line-700 px-2 py-1 text-tiny text-text-secondary hover:border-line-600 hover:text-text-primary transition-colors">
        {copied ? "copied ✓" : "copy"}
      </button>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-line-700 text-tiny text-text-muted flex items-center justify-center font-mono">
      {n}
    </span>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={`step-${n}`} className="border border-line-800 rounded-card bg-ink-900 p-card">
      <div className="flex items-center gap-3 mb-3">
        <Num n={n} />
        <h2 className="text-h3 font-bold">{title}</h2>
      </div>
      <div className="space-y-3 text-body text-text-secondary">{children}</div>
    </section>
  );
}

/** Per-agent rows (step 6) — exactly SUPPORT.md / extension login hints.
 * cmd is the real command (copy button); note is the extra context. */
const AGENT_LOGIN: { name: string; cmd: string; note: string }[] = [
  { name: "Claude Code", cmd: "claude", note: "then complete /login in the TUI" },
  { name: "Codex", cmd: "codex login", note: "" },
  { name: "OpenCode", cmd: "opencode auth login", note: "project: opencode.json" },
  { name: "Pi", cmd: "pi", note: "sign in inside the TUI with your provider key" },
  { name: "Antigravity", cmd: "agy", note: "sign in once interactively to authenticate" },
  { name: "Copilot CLI", cmd: "copilot auth login", note: "needs a GitHub Copilot subscription" },
];

export function GettingStartedDoc() {
  return (
    <div className="space-y-4">
      <Step n={1} title="Sign in with GitHub on the website">
        <p>
          GitHub is the only sign-in method — read:user, no emails, no extra
          passwords, and your agent credentials never leave your machine.
          Your first sign-in creates a personal team automatically, so the
          extension always has a team to scope its token to.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="/api/auth/github" className="pill-fill px-5 py-2 text-small font-medium">
            Continue with GitHub
          </a>
          <a href="/login" className="pill-outline px-5 py-2 text-small">
            Open the sign-in page
          </a>
        </div>
      </Step>

      <Step n={2} title="Download and install the VS Code extension">
        <p>
          Download the .vsix below. In VS Code, open <strong>Extensions</strong>,
          click the <strong>⋯</strong> menu → <strong>Install from VSIX…</strong>,
          and pick the file. Reload VS Code if it asks.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a href={VSIX_RELEASE_URL} download className="pill-fill px-5 py-2 text-small font-medium">
            Download deadend-{VSIX_VERSION}.vsix
          </a>
          <span className="text-tiny text-text-muted font-mono">
            {VSIX_SIZE} · sha256 {VSIX_SHA256.slice(0, 16)}…
          </span>
        </div>
      </Step>

      <Step n={3} title="Sign in from VS Code">
        <p>
          Command palette → <strong>DeadEnd: Sign in</strong> (or click
          &ldquo;DeadEnd: sign in&rdquo; in the status bar). A code like
          <code className="font-mono text-text-primary"> A1B2-C3D4-E5F6 </code>
          appears in a notification, and your browser opens the approval page —
          approve it there.
        </p>
        <p>
          When it worked, the status bar bottom-right shows
          <code className="font-mono text-text-primary"> ✓ DeadEnd: your-login · team owner</code>.
          The token is delivered to the extension exactly once, then stored in
          VS Code&apos;s SecretStorage — never in a file.
        </p>
      </Step>

      <Step n={4} title="Choose a team">
        <p>
          Command palette → <strong>DeadEnd: Choose team</strong>. Pick from your
          teams (create or rename one in the dashboard under Teams — your
          personal team is already there). The extension then asks whether to
          include <em>global context</em>: the verified, redacted fixes everyone
          shares. You can change this later by running the command again.
        </p>
      </Step>

      <Step n={5} title="Install the runner">
        <p>
          The extension drives your agent through the <code className="font-mono text-text-primary">deadend-runner</code>{" "}
          CLI. The Run panel has an <strong>Install runner</strong> button that
          runs this for you (pipx preferred, pip fallback), or run it yourself:
        </p>
        <Copyable text="pipx install git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner" />
        <p>
          Verify — it prints one capability row per supported agent:
        </p>
        <Copyable text="deadend-runner agents" />
      </Step>

      <Step n={6} title="Log in to your coding agent(s)">
        <p>
          The runner drives agents headless, so each CLI needs its own login
          once, exactly as you would normally:
        </p>
        <div className="border border-line-900 rounded-cell divide-y divide-line-900">
          {AGENT_LOGIN.map((a) => (
            <div key={a.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="w-32 shrink-0 text-small text-text-primary">{a.name}</span>
              <span className="flex-1 min-w-[12rem]"><Copyable inline text={a.cmd} /></span>
              {a.note && <span className="text-tiny text-text-muted">{a.note}</span>}
            </div>
          ))}
        </div>
        <p className="text-tiny text-text-muted">
          The extension never sees these credentials — the agent CLIs keep them
          themselves and run locally.
        </p>
      </Step>

      <Step n={7} title="Neatlogs tracing">
        <p>
          DeadEnd records run traces with the project owner’s server-side
          Neatlogs key. You do not need a Neatlogs account or key on your machine.
          If recording is unavailable, ask the DeadEnd project owner to configure
          DEADEND_NEATLOGS_API_KEY and DEADEND_NEATLOGS_PROJECT on the backend.
        </p>        <p>
          The extension checklist reports success after the backend records a
          trace. OpenCode and other agent providers keep their own local sign-in;
          DeadEnd does not use those provider keys for Neatlogs.
        </p>
      </Step>

      <Step n={8} title="Enable Entire in your repo">
        <p>
          Sign in once with <code className="font-mono text-text-primary">entire login</code>, then run this in the repo (swap <code className="font-mono text-text-primary">claude-code</code>{" "}
          for your agent — codex, opencode, pi, antigravity, copilot-cli). It
          enables the agent capture hooks and Entire search skill. Sessions,
          prompts, tool calls, edits, and checkpoints become searchable work
          history that DeadEnd retrieves before later runs:
        </p>
        <Copyable text="entire enable --agent claude-code --search-skill" />
        <p>
          The extension&apos;s setup checklist has an <strong>Enable Entire</strong>{" "}
          button that runs exactly this in your workspace and shows the real
          exit code. After your first run, the checklist flips to recording.
        </p>
      </Step>

      <Step n={9} title="Run a task with memory on">
        <p>
          Command palette → <strong>DeadEnd: Run task</strong> (or the Run panel).
          Keep <strong>Use memory</strong> on: before the agent starts, DeadEnd
          retrieves matching dead ends, constraints and verified fixes by
          signature. Watch the live timeline — every phase comes from the
          runner&apos;s real events, and the footer counters say &ldquo;not
          reported&rdquo; rather than guessing. When the run finishes, save the
          result as a memory from the result card. Toggle memory off any time
          for a baseline run to compare against.
        </p>
      </Step>

      <Step n={10} title="Share to team or publish to global">
        <p>
          <strong>Share fix with team</strong> makes a private memory visible to
          your team, keeping full detail: attempts, reasons, the recipe, the
          environment. <strong>Publish to global</strong> is opt-in and two-step:
          the fix is redacted — connection strings, bearer tokens and
          secret-shaped strings are stripped, and anything suspicious was
          already quarantined before it could be stored — and you approve the
          exact diff before it is published.
        </p>
        <p>
          Global confidence is earned, not declared: every observation is a real
          reuse — a replay that worked, or one that didn&apos;t.
        </p>
      </Step>

      {/* ------------------------------------------------- troubleshooting */}
      <section className="border border-line-800 rounded-card bg-ink-900 p-card">
        <h2 className="text-h3 font-bold mb-4">Troubleshooting</h2>
        <div className="space-y-4 text-small text-text-secondary">
          <div>
            <div className="text-text-primary font-medium mb-1">The server wakes slowly on the first request</div>
            <p>
              The backend sleeps after inactivity, so the first sign-in or
              device approval can take up to a minute while it wakes. Wait, then
              try again — later requests are fast. If a device code expired
              during the wait, start sign-in again for a fresh code.
            </p>
          </div>
          <div>
            <div className="text-text-primary font-medium mb-1">The extension still shows &ldquo;sign in&rdquo; after I approved</div>
            <p>
              The extension polls every ~3 seconds and should show your name in
              the status bar within a few seconds. Codes expire after 15 minutes
              and the token is delivered exactly once — if it timed out, run{" "}
              <strong>DeadEnd: Sign in</strong> again. Also make sure you
              approved in the same browser you are signed into the dashboard with.
            </p>
          </div>
          <div>
            <div className="text-text-primary font-medium mb-1">Runner not found</div>
            <p>
              The checklist runs <code className="font-mono">deadend-runner agents</code>;
              failure means the CLI is not on the PATH VS Code sees. Reinstall
              with the extension&apos;s Install runner button or the pipx
              command in step 5. If pipx installed to <code className="font-mono">~/.local/bin</code>,
              restart VS Code from a shell where that is on PATH, or point the{" "}
              <code className="font-mono">deadend.runnerPath</code> setting at the binary.
            </p>
          </div>
          <div>
            <div className="text-text-primary font-medium mb-1">Agent not detected</div>
            <p>
              The Run panel only lists agents whose CLI it can find on PATH.
              Install your agent and log in once (step 6), then click{" "}
              <strong>Refresh</strong> in the checklist. OpenCode additionally
              needs an <code className="font-mono">opencode.json</code> in the workspace.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

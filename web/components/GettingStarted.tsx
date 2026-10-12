"use client";

/** Getting-started guide content — the ten steps from zero to a reused
 * memory, plus troubleshooting. Every command is copy-paste; every claim
 * is what the shipped product actually does (extension commands from
 * extension/package.json, per-agent login lines from SUPPORT.md, status
 * strings from extension/src/auth.ts). Shared with /app/getting-started
 * via <Copyable>. */
import { useState } from "react";
import { VSIX_RELEASE_URL, VSIX_SHA256, VSIX_SIZE, VSIX_VERSION } from "./Download";

/** Single-line/multi-line command block with a copy button. */
export function Copyable({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative mt-3">
      <pre className="font-mono text-tiny text-text-secondary bg-ink-850 border border-line-900 rounded-cell p-3 pr-16 overflow-x-auto">{text}</pre>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute top-2 right-2 rounded-chip border border-line-700 px-2 py-1 text-tiny text-text-secondary hover:border-line-600 hover:text-text-primary transition-colors"
      >
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

/** Per-agent rows (step 6) — exactly SUPPORT.md / extension login hints. */
const AGENT_LOGIN: { name: string; hint: string }[] = [
  { name: "Claude Code", hint: "run `claude` once and complete /login" },
  { name: "Codex", hint: "run `codex login` in a terminal" },
  { name: "OpenCode", hint: "run `opencode auth login` (project: opencode.json)" },
  { name: "Pi", hint: "run `pi` once; sign in inside the TUI with your provider key" },
  { name: "Antigravity", hint: "run `agy` once interactively to authenticate" },
  { name: "Copilot CLI", hint: "run `copilot auth login` (GitHub Copilot subscription)" },
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
            <div key={a.name} className="flex flex-wrap gap-2 px-3 py-2 text-small">
              <span className="w-32 shrink-0 text-text-primary">{a.name}</span>
              <span className="font-mono text-tiny text-text-secondary">{a.hint}</span>
            </div>
          ))}
        </div>
        <p className="text-tiny text-text-muted">
          The extension never sees these credentials — the agent CLIs keep them
          themselves and run locally.
        </p>
      </Step>

      <Step n={7} title="Set NEATLOGS_API_KEY">
        <p>
          neatlogs traces every run so DeadEnd can locate the failing step and
          its cause. Get a project API key from your neatlogs project settings,
          then export it in the shell (or environment) you run agents from:
        </p>
        <Copyable text="export NEATLOGS_API_KEY=<your neatlogs project key>" />
        <p>
          Optional, for fuller per-agent capture:
          <code className="font-mono text-text-primary"> pip install neatlogs neatlogs-claude-code</code>{" "}
          (codex and opencode plugins likewise — see SUPPORT.md). The
          extension&apos;s checklist marks neatlogs recording once a run has
          actually recorded a trace id; a key alone shows as &ldquo;set, no run
          recorded yet&rdquo;.
        </p>
      </Step>

      <Step n={8} title="Enable Entire in your repo">
        <p>
          Run this once in the repo (swap <code className="font-mono text-text-primary">claude-code</code>{" "}
          for your agent — codex, opencode, pi, antigravity, copilot-cli). It
          writes that agent&apos;s hooks so every checkpoint — prompts,
          decisions, diff — is recorded with your commits:
        </p>
        <Copyable text="entire enable --agent claude-code" />
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

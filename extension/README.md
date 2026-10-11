# DeadEnd VS Code extension

Failure-memory for coding agents, inside your editor: retrieve verified
dead ends and fixes, run any supported coding agent on a task, watch the
run live, and share what works with your team — nothing ever leaves your
machine without explicit clicks.

## Install

1. Download `deadend-0.1.0.vsix` from the project's GitHub Releases (the
   web app links it directly), or build it: `npm install && npm run
   package` in `extension/` (produces `extension/dist/deadend-0.1.0.vsix`).
2. In VS Code: **Extensions → ⋯ → Install from VSIX…** → pick the file.
3. Command palette → **DeadEnd: Sign in**. The browser opens the
   DeadEnd web app (you must be signed in there); approve the device
   code shown in the notification. The token is stored **only** in VS
   Code SecretStorage — never in settings files or workspace files.
4. Command palette → **DeadEnd: Choose team** → pick your team and
   whether retrieval includes global context.
5. Click the DeadEnd icon in the Activity Bar. Pick an agent, describe
   the task, hit **Run**.

## The runner (required for running agents)

The extension shells out to the `deadend-runner` CLI. If it's missing you
get a clear message with an **Install runner** button (pipx if available,
otherwise `pip install --user`), from this repo:

    pipx install git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner
    # or
    pip install --user "deadend-runner @ git+https://github.com/gowthamchoudhary/DeadEnd#subdirectory=deadend-runner"

Verify with `deadend-runner agents`.

## Supported agents and what each login needs

Full integration matrix lives in [SUPPORT.md](../SUPPORT.md). Summary —
the extension invokes the agent CLI yourself already use, with **your
credentials on your machine; DeadEnd never reads or transmits them**:

| Agent | Headless command used | You must be signed in via |
|---|---|---|
| Claude Code | `claude -p --output-format json --max-turns N` | `claude` login (your Claude plan) |
| Codex | `codex exec --json --sandbox workspace-write` | `codex login` (ChatGPT) |
| OpenCode | `opencode run --auto --format json` | `opencode auth login` (your provider key) |
| Pi | `pi --mode json --no-session` | your provider key in Pi's own config |
| Antigravity CLI | `agy -p --output-format json` | sign in once in an interactive `agy` session |
| Copilot CLI | `copilot --autopilot -p --output-format json` | `copilot login` (GitHub) |

## Settings

- `deadend.backendUrl` — DeadEnd backend base URL
  (default: `https://deadend-4wyx.onrender.com`; change the setting or
  the constant in `src/api.ts` (`BACKEND_URL_DEFAULT`) to point at your
  own deployment).
- `deadend.runnerPath` — how to invoke the runner (default `deadend-runner`).
- `deadend.dashboardUrl` — web dashboard base used by Memories → open entry.

## Privacy

- Your agent credentials are never read, logged, or sent anywhere.
- Your DeadEnd token lives in SecretStorage and is only sent to the
  backend you configure as `Authorization: Bearer`.
- Run context history stays in your team unless **you** explicitly
  share (verified fixes only) and then explicitly publish to global.

# Agent SUPPORT.md — how each agent integrates with DeadEnd

Last verified against official docs: **2026-10-11**. Every claim below
comes from the linked doc page or the shipped adapter code (which cites
the same pages in its docstring). Nothing "coming soon": all six agents
are implemented today via the routes marked **Integration**.

| Agent | Integration: runner | Integration: MCP | Instruction file injected | Entire captures | neatlogs captures | Token reporting | Works partially / caveats |
|---|---|---|---|---|---|---|---|
| **Claude Code** | Headless adapter — `claude -p --output-format json --max-turns N` ([headless docs](https://code.claude.com/docs/en/headless)) | `.mcp.json` (JSON, mcpServers) ([MCP docs](https://code.claude.com/docs/en/mcp)) | `CLAUDE.md` (managed DeadEnd block) ([memory docs](https://code.claude.com/docs/en/memory)) | Via hooks in `.claude/settings.json` written by `entire enable --agent claude-code`: full conversation, files, tool calls, tokens, subagents ([Entire: claude-code](https://docs.entire.io/agents/claude-code)) | Ship a plugin (`neatlogs-claude-code`); runner-level WORKFLOW trace always on | Reported in `--output-format json` result events (usage) | — |
| **Codex** | Headless adapter — `codex exec --json --sandbox workspace-write --ask-for-approval never` ([non-interactive docs](https://developers.openai.com/codex/cli/start-noninteractive)) | `.codex/config.toml` TOML `[mcp_servers.deadend]` ([config docs](https://developers.openai.com/codex/config)) | `AGENTS.md` (managed DeadEnd block) ([AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)) | Via `.codex/hooks.json` from `entire enable --agent codex`: boundaries, prompts, turns, file-changing subagents; tokens read from Codex rollout files ([Entire: codex](https://docs.entire.io/agents/codex)) | Ship a plugin (`neatlogs-codex`); runner-level WORKFLOW trace always on | Reported on `turn.completed` JSONL events (`input_tokens`, `output_tokens`) | No documented turn-cap flag for `codex exec`; DeadEnd enforces a 10-min runner wall clock instead. Codex does not roll subagent tokens into parent totals. |
| **OpenCode** | Headless adapter — `opencode run --auto --format json` ([CLI docs](https://opencode.ai/docs/cli/)) | `opencode.json` `mcp` key, `{"type":"local","command":[...]}` ([MCP docs](https://opencode.ai/docs/mcp-servers/)) | `AGENTS.md` (project AGENTS.md wins over CLAUDE.md per [rules docs](https://opencode.ai/docs/rules/)) | Via `.opencode/plugins/entire.ts` from `entire enable --agent opencode`: session/turn events, `opencode export` for transcript+tokens; no subagent capture ([Entire: opencode](https://docs.entire.io/agents/opencode)) | Ship a plugin; runner-level WORKFLOW trace always on | `--format json` emits raw JSON events; the CLI docs don't pin the event schema, so DeadEnd parses token/model fields defensively and reports `not verified` when absent | No documented turn-limit flag; hooks are plugin events, not hook files. Entire cannot import pre-existing OpenCode sessions. |
| **Pi** | Headless adapter — `pi --mode json --no-session "<prompt>"` ([CLI integration](https://pi.dev/docs/latest/cli-integration)) | `.pi/mcp.json` (JSON, mcpServers) ([MCP docs](https://pi.dev/docs/latest/mcp)) | `AGENTS.md` (auto-discovered per [CLI reference](https://pi.dev/docs/latest/cli)) | Via `.pi/extensions/entire/index.ts` from `entire enable --agent pi`: boundaries, prompts, turns, transcript tokens; no subagent tree ([Entire: pi](https://docs.entire.io/agents/pi)) | No documented plugin — runner-level WORKFLOW trace covers it | Provider-reported usage in `message_update.usage` (input/output), model in `message_end.message` ([JSON docs](https://pi.dev/docs/latest/json)) | Shell-mediated file changes may not appear as transcript tool edits. No documented max-turn flag; 10-min runner wall clock applies. |
| **Antigravity CLI** | Headless adapter — `agy -p --output-format json --print-timeout 540s` ([headless docs](https://antigravity.google/docs/cli/headless/)) | `.agents/mcp_config.json` (JSON, mcpServers) ([MCP docs](https://antigravity.google/docs/mcp/)) | `AGENTS.md` (workspace rules auto-discovered per [rules docs](https://antigravity.google/docs/rules/)) | Via `.agents/hooks.json` from `entire enable --agent antigravity`: turn boundaries + file changes; transcript from JSONL; tokens via the title feed (global settings wrapper) ([Entire: antigravity](https://docs.entire.io/agents/antigravity)) | No documented plugin — runner-level WORKFLOW trace covers it | Exact: the `json` envelope carries `usage{input_tokens, output_tokens, thinking_tokens, cache_read_tokens, total_tokens}` and `num_turns` | You must log in once in an interactive `agy` session first — unauthenticated headless runs exit with an auth error instead of hanging. No documented turn-count flag. Entire does not yet attach Antigravity subagent sessions to parent checkpoints. |
| **Copilot CLI** | Headless adapter — `copilot --autopilot --allow-all-tools --no-ask-user --max-autopilot-continues N -p --output-format json` ([programmatic reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference)) | `.mcp.json` (JSON, mcpServers) ([MCP docs](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers)) | `AGENTS.md` (loaded alongside other instruction files; no documented cross-file precedence per [custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)) | Via `.github/hooks/entire.json` from `entire enable --agent copilot-cli`: boundaries, prompts, turns, tool activity, subagent completion; tokens reported at session end ([Entire: copilot-cli](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks)) | No documented plugin — runner-level WORKFLOW trace covers it | **Not verified**: `--output-format json` is documented as JSONL but the reference doesn't document the event schema or usage fields; DeadEnd parses defensively and reports tokens as null rather than inventing numbers | Prompt hooks (preToolUse/postToolUse on prompt turns) **do not fire in `-p` mode** per the hooks docs — capture relies on the runner trace + Entire's transcript reading. No general step-limit flag; autopilot continuation cap is the documented turn-like limit. |

## How the three integration routes work together

Entire is also an active retrieval source, not only a capture hook. Before
each memory-enabled run, the local runner searches the current repository's
Entire session/checkpoint index with the authenticated CLI, fetches compact
transcript excerpts for the best hits, and injects them alongside curated
DeadEnd entries under one context budget. Raw transcripts and the Entire
login remain local. Enable the agent search skill with `entire enable --agent
<name> --search-skill` and authenticate with `entire login`.

1. **Headless adapter (runner)** — `deadend-runner run <repo> <task> --agent <name>`.
   Retrieves context from the backend, injects the DeadEnd block into the
   agent's instruction file, drives the agent headless inline (also passing
   the context in the prompt), runs tests, records the run with agent/model/
   token/duration telemetry, and wraps everything in a neatlogs WORKFLOW
   trace (spans: retrieve → attempt → test → verify → record).
2. **MCP (agents run by hand)** — `deadend-runner mcp-config --agent <name>`
   prints the exact config snippet for the agent's own config format (JSON
   or TOML, per the table above); `deadend-mcp` is the stdio server. Tools:
   `deadend_retrieve`, `deadend_record_attempt`, `deadend_record_fix`,
   `deadend_report_reuse`, `deadend_promote_preview`. The server attaches
   only your DeadEnd token (`DEADEND_TOKEN`) to backend calls and never
   touches agent credentials.
3. **Hooks / capture (Entire)** — `entire enable --yes --agent <name>` in
   the target repo; DeadEnd's runner `--setup` flag runs it for you, plus
   best-effort install of the agent's neatlogs plugin where one is
   documented (claude-code, codex, opencode).

# AgentPad

AgentPad is a local-first review workspace for humans and coding agents. It lets you open a real file, leave threaded comments anchored to exact text, and collaborate through a shared browser UI plus CLI workflow.

docs/videos/agentpad-vertical-codex-demo.mp4

## Quickstart

**Installation**

```bash
go install github.com/cyrusaf/agentpad@latest
agentpad install-skill
```

**Usage**

Start AgentPad:

```bash
agentpad serve
```

Then run Codex with the AgentPad skill on a local file:

```text
Use $agentpad to review /absolute/path/to/plan.md in AgentPad.
Start the AgentPad server if needed.
When you need to update the document, use agentpad read --json to get an anchor and then use agentpad edit with that anchor.
Reply in existing AgentPad threads instead of editing sidecar metadata directly.
```

## What It Feels Like

Imagine a coding agent drafts `plan.md` for a checkout migration:

- the agent writes the plan to a real file on disk
- you open that file in AgentPad
- you leave comments like "split this into two PRs" or "define the rollback signal"
- AgentPad gives you a browser link back to the document and thread
- the human and the agent review the same file instead of copying feedback back and forth

AgentPad keeps the source file on disk as the source of truth and stores collaboration metadata under `~/.agentpad`.

## CLI Example

```bash
agentpad open ./plan.md
agentpad open ./plan.md --json
agentpad read ./plan.md --quote "rollback signal" --prefix "define the " --json
agentpad edit ./plan.md --anchor-file /tmp/anchor.json --text "rollback threshold" --json
agentpad threads create ./plan.md --start 120 --end 168 --body "Split this into two PRs." --json
```

For agent-driven edits, the preferred flow is:

1. `agentpad read ... --json` to get a reusable `anchor`
2. `agentpad edit ... --anchor-json/--anchor-file --text ...` to apply the edit through AgentPad's collab engine

Low-level `edit --start/--end --base-revision ...` still exists, but anchor-first editing is the safer default for concurrent human + agent work.

## Install The Skill Manually

`agentpad install-skill` is the fastest path. If you want to install from a local checkout manually instead, link [skills/agentpad/SKILL.md](skills/agentpad/SKILL.md) into `${CODEX_HOME:-$HOME/.codex}/skills/agentpad`.

## Demo Generation

Demo generation instructions live in [docs/demo.md](docs/demo.md).

## Config

AgentPad reads `agentpad.toml` from the current working directory, then falls back to `~/.agentpad/config.toml` when no local config is present. Override with `--config` or `AGENTPAD_CONFIG`.

Key sections:

- `[server]`: listen address and base URL
- `[storage]`: root directory for AgentPad runtime metadata
- `[identity]`: default display name for the CLI

## Local Development

Start the server:

```bash
go run . serve
```

Run the web app in another terminal:

```bash
cd web
npm install
npm run dev
```

## Tests

Backend:

```bash
go test ./...
```

Frontend:

```bash
cd web
npm test
npm run build
```

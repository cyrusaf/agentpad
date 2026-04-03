# AgentPad

AgentPad is a local-first review workspace for humans and coding agents. It lets you open a real file, leave threaded comments anchored to exact text, and collaborate through a shared browser UI plus CLI workflow.

https://github.com/user-attachments/assets/9ec7d0c0-871a-4589-8e4e-9aa9cddd0093

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

Open the local file in the AgentPad UI:

```bash
agentpad open /path/to/file
```

Then run Codex with the AgentPad skill on a local file:

```text
Use $agentpad to review /path/to/file in AgentPad.
Start the AgentPad server if needed.
When you need to update the document, use agentpad read --json to get an anchor and then use agentpad edit with that anchor.
For multiline inserts or replies, prefer agentpad edit --text-file / agentpad threads reply --body-file so real newlines are preserved.
Reply in existing AgentPad threads instead of editing sidecar metadata directly.
```

## CLI Example

The CLI is primarily for the agent to use when interacting with AgentPad.

```bash
agentpad open ./plan.md
agentpad open ./plan.md --json
agentpad read ./plan.md --quote "rollback signal" --prefix "define the " --json
agentpad edit ./plan.md --anchor-file /tmp/anchor.json --text "rollback threshold" --json
printf '\n\nrollback threshold' > /tmp/replacement.txt
agentpad edit ./plan.md --anchor-file /tmp/anchor.json --text-file /tmp/replacement.txt --json
agentpad threads create ./plan.md --start 120 --end 168 --body "Split this into two PRs." --json
```

For agent-driven edits, the preferred flow is:

1. `agentpad read ... --json` to get a reusable `anchor`
2. `agentpad edit ... --anchor-json/--anchor-file --text ...` to apply the edit through AgentPad's collab engine
3. For multiline text, use `--text-file` or `--body-file` instead of shell-escaped `\n`

Low-level `edit --start/--end --base-revision ...` still exists, but anchor-first editing is the safer default for concurrent human + agent work.

## Install The Skill Manually

`agentpad install-skill` is the fastest path. If you want to install from a local checkout manually instead, link [skills/agentpad/SKILL.md](skills/agentpad/SKILL.md) into `${CODEX_HOME:-$HOME/.codex}/skills/agentpad`.

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

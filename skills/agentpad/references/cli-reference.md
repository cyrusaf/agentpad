# AgentPad CLI Reference

Use this reference when the task needs concrete command patterns, config discovery reminders, or troubleshooting details beyond the core skill.

## Defaults

- The CLI loads `agentpad.toml` from the current working directory, then falls back to `~/.agentpad/config.toml`, unless `--config` is provided.
- The default server base URL is `http://127.0.0.1:8080`.
- The default actor name is `Agent`.
- AgentPad stores runtime metadata under `~/.agentpad`; treat that data as server-owned.

## When To Prefer This Skill

Prefer this skill when the user wants to collaborate on a local document instead of making isolated file edits:

- add comments or review feedback
- reply to or resolve existing discussion
- open a document in AgentPad for the user
- share a browser link so the user can inspect comments in context

If the request is fundamentally about review or collaboration on a doc, AgentPad is usually the right workflow.

## Preferred Runner

Prefer the installed `agentpad` binary. The same binary starts the server with `agentpad serve` and performs document operations:

```bash
agentpad --help
```

Expected source-backed commands in this repo:

- `open`
- `read`
- `edit`
- `threads`
- `activity`
- `export`

## Server Readiness

Check health first:

```bash
curl -fsS http://127.0.0.1:8080/api/health
```

If health fails, start the server:

```bash
agentpad serve
```

Then verify health again before operating on documents or sharing browser links.

## Typical Review Flow

```bash
curl -fsS http://127.0.0.1:8080/api/health
agentpad open /absolute/path/to/file.md --json
agentpad read /absolute/path/to/file.md --quote "Old text" --prefix "Before " --suffix " after" --json > /tmp/read.json
jq '.anchor' /tmp/read.json > /tmp/anchor.json
agentpad edit /absolute/path/to/file.md --anchor-file /tmp/anchor.json --text "Clarified section." --json
printf '\n\nClarified section with a real paragraph break.' > /tmp/replacement.txt
agentpad edit /absolute/path/to/file.md --anchor-file /tmp/anchor.json --text-file /tmp/replacement.txt --json
agentpad threads create /absolute/path/to/file.md --start 120 --end 168 --body "Clarify this section." --json
agentpad threads list /absolute/path/to/file.md --json
```

Use smaller reads once you know the area of interest. Avoid reading the whole document when a scoped read will do.

## Document Editing

Apply document edits through AgentPad instead of patching the file directly. Prefer anchor-first edits:

```bash
agentpad read /absolute/path/to/file.md --quote "Old text" --prefix "Before " --suffix " after" --json
agentpad edit /absolute/path/to/file.md --anchor-json '{"block_id":"...","start":0,"end":8,"doc_start":120,"doc_end":128,"quote":"Old text","revision":3}' --text "New text" --json
printf '\n\nNew paragraph.' > /tmp/replacement.txt
agentpad edit /absolute/path/to/file.md --anchor-file /tmp/anchor.json --text-file /tmp/replacement.txt --json
```

Notes:

- `read --start/--end`, `read --block`, and `read --quote ...` can all return an `anchor` in JSON output.
- `edit --anchor-json` and `edit --anchor-file` are the primary agent-facing edit inputs.
- For multiline text, prefer `edit --text-file` over trying to pass `\n` through shell quoting.
- The anchor carries the revision and quote context needed for AgentPad to resolve and rebase the edit safely.
- Positional `edit --start/--end --base-revision ...` remains available as a low-level fallback.

## Search and Targeting

Use query-based reads to find a section before deciding on offsets:

```bash
agentpad read /absolute/path/to/file.md --query "Release checklist" --json
```

Use block reads when you already have a block identifier and want an anchor for the whole block:

```bash
agentpad read /absolute/path/to/file.md --block block-123 --json
```

Use quote reads when you want a deterministic anchor for a precise span:

```bash
agentpad read /absolute/path/to/file.md --quote "flag" --prefix "feature " --suffix ", with metrics" --json
```

## Thread Management

Reply:

```bash
agentpad threads reply /absolute/path/to/file.md <thread-id> --body "Handled in the latest draft." --json
printf 'Handled in the latest draft.\n\nAdded detail in a second paragraph.' > /tmp/reply.txt
agentpad threads reply /absolute/path/to/file.md <thread-id> --body-file /tmp/reply.txt --json
```

Resolve:

```bash
agentpad threads resolve /absolute/path/to/file.md <thread-id> --json
```

Reopen:

```bash
agentpad threads reopen /absolute/path/to/file.md <thread-id> --json
```

## Export

Write export output to stdout:

```bash
agentpad export /absolute/path/to/file.md --format markdown
```

Write export output to a file and still emit JSON confirmation:

```bash
agentpad export /absolute/path/to/file.md --format markdown --out /tmp/file.md --json
```

## Deep Links

The web app reads document state from URL query parameters:

- `path`: absolute file path
- `thread`: optional thread ID

Example document link:

```text
http://127.0.0.1:8080/?path=%2FUsers%2Fyou%2Fnotes%2Fdraft.md
```

Example thread link:

```text
http://127.0.0.1:8080/?path=%2FUsers%2Fyou%2Fnotes%2Fdraft.md&thread=thread-123
```

Use the configured base URL when it differs from the default. Always URL-encode the `path` value.

## Troubleshooting

- `connection refused`:
  The server is probably not running at the configured base URL. Start `agentpad serve` or pass `--server`.
- Wrong actor name:
  Pass `--name` or `--actor`, or inspect `[identity].name` in `agentpad.toml` or `~/.agentpad/config.toml`.
- Wrong command surface from the installed binary:
  Re-check which `agentpad` binary is on `PATH` or install the current CLI build.
- Relative path errors:
  AgentPad commands expect an absolute file path for document operations.
- Quote read is ambiguous:
  Add `--prefix`, `--suffix`, or `--block` so AgentPad can resolve exactly one span.
- Anchor edit became stale:
  Re-run `agentpad read --json` to get a fresh anchor from the current document state, then retry the edit.
- Browser link does not load the app:
  The server might not be serving the frontend at that base URL. Confirm the app is available before telling the user the link is ready.

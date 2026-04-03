---
name: agentpad
description: Use when the user wants to collaborate on a local document through AgentPad, especially for review and comment workflows. Prefer this skill when the user asks for comments, review feedback, threaded discussion, collaboration on a doc, or wants a document opened in AgentPad so they can read or respond in the web UI. This skill applies when Codex should open a local file, inspect scoped content, derive reusable anchors, edit document content through AgentPad, create or reply to comment threads, resolve or reopen threads, review activity, export a document, start the AgentPad server if needed, and share a browser deep link to the document instead of editing markdown sidecars directly.
---

# AgentPad

Use this skill when the task is about reviewing or operating on a local document through AgentPad's server-backed workflow.

## Setup

- If the `agentpad` command is missing and the task is to help the user get started, install it with `go install github.com/cyrusaf/agentpad@latest`.
- If this repo is checked out locally but the skill is not installed in Codex yet, link `skills/agentpad` into `${CODEX_HOME:-$HOME/.codex}/skills/agentpad`.

## Core Rules

- The server is the only writer. Do not edit AgentPad metadata files manually, including anything stored under `~/.agentpad`.
- For AgentPad-managed documents, document content edits must also go through AgentPad. Do not edit the source file directly with shell editors, `apply_patch`, or ad hoc scripts.
- Treat the absolute file path as the document identifier.
- Prefer the `agentpad` CLI over ad hoc HTTP calls when the task is a normal AgentPad workflow.
- Treat `agentpad serve` as the canonical way to start AgentPad. Do not assume a separate server binary needs to be installed.
- Let the CLI discover `--server` and `--name` from config unless the user or environment already dictates overrides.
- Use `--json` when another agent or script may need to parse the result.
- Prefer AgentPad whenever the user wants collaboration, comments, or review on a local doc, because the threaded UI is the best place for them to read and respond.
- After creating, replying to, resolving, or reopening comments, give the user an AgentPad browser link to the document so they can open it and inspect the thread state themselves.
- For content edits, prefer the anchor-first flow: use `agentpad read --json` to get an `anchor`, then pass that anchor into `agentpad edit` so concurrent changes can rebase through AgentPad instead of being overwritten.

## Runner Selection

- Prefer `agentpad` on `PATH` when `agentpad --help` shows the current command surface: `open`, `read`, `edit`, `threads`, `activity`, and `export`.
- If `agentpad --help` shows unrelated commands such as `docs` or `import` instead of `open`, do not guess. Re-check which binary is on `PATH` or install the current CLI build before proceeding.

## Workflow

1. Determine the AgentPad base URL from config when available. Default to `http://127.0.0.1:8080`.
2. Check whether the server is already running:
   `curl -fsS http://127.0.0.1:8080/api/health`
3. If the health check fails, start the server:
   `agentpad serve`
   Then verify health again before proceeding.
4. Confirm the CLI can reach the server:
   `agentpad open /absolute/path/to/file.md --json`
5. Read only the scope needed for the task before commenting or exporting, and prefer a read mode that returns a reusable anchor:
   `agentpad read /absolute/path/to/file.md --start 10 --end 40 --json`
   `agentpad read /absolute/path/to/file.md --quote "old text" --prefix "before " --suffix " after" --json`
6. If the task requires a document content change, perform it through AgentPad only by reusing the returned anchor:
   `agentpad edit /absolute/path/to/file.md --anchor-json '<anchor-json>' --text "replacement text" --json`
   For multiline inserts or replacements, prefer `--text-file` so paragraph breaks are real newlines instead of shell-escaped `\n` literals.
7. Use thread commands for review feedback instead of editing sidecar metadata directly.
8. Build a browser deep link with the document path:
   `http://127.0.0.1:8080/?path=%2Fabsolute%2Fpath%2Fto%2Ffile.md`
   If you touched a specific thread, include it:
   `http://127.0.0.1:8080/?path=%2Fabsolute%2Fpath%2Fto%2Ffile.md&thread=<thread-id>`
9. Report the exact file path, commands used, any thread IDs created or touched, and the browser deep link.

## Common Commands

- Open a file:
  `agentpad open /absolute/path/to/file.md --json`
- Read a file or a narrow range:
  `agentpad read /absolute/path/to/file.md --json`
  `agentpad read /absolute/path/to/file.md --start 10 --end 40 --json`
  `agentpad read /absolute/path/to/file.md --quote "old text" --prefix "before " --suffix " after" --json`
- Edit a file through AgentPad:
  `agentpad edit /absolute/path/to/file.md --anchor-json '<anchor-json>' --text "replacement text" --json`
  `agentpad edit /absolute/path/to/file.md --anchor-file /tmp/anchor.json --text "replacement text" --json`
  `agentpad edit /absolute/path/to/file.md --anchor-file /tmp/anchor.json --text-file /tmp/replacement.txt --json`
  `agentpad edit /absolute/path/to/file.md --start 10 --end 40 --text "replacement text" --base-revision <revision> --json`
- Search or target a block:
  `agentpad read /absolute/path/to/file.md --query "heading text" --json`
  `agentpad read /absolute/path/to/file.md --block <block-id> --json`
- List threads:
  `agentpad threads list /absolute/path/to/file.md --json`
- Create a thread:
  `agentpad threads create /absolute/path/to/file.md --start 10 --end 40 --body "Comment text" --json`
  `agentpad threads create /absolute/path/to/file.md --start 10 --end 40 --body-file /tmp/comment.txt --json`
- Reply to a thread:
  `agentpad threads reply /absolute/path/to/file.md <thread-id> --body "Reply text" --json`
  `agentpad threads reply /absolute/path/to/file.md <thread-id> --body-file /tmp/reply.txt --json`
- Resolve or reopen:
  `agentpad threads resolve /absolute/path/to/file.md <thread-id> --json`
  `agentpad threads reopen /absolute/path/to/file.md <thread-id> --json`
- Review activity:
  `agentpad activity /absolute/path/to/file.md --json`
- Export:
  `agentpad export /absolute/path/to/file.md --format markdown`
  `agentpad export /absolute/path/to/file.md --format markdown --out /tmp/export.md --json`

For extended command patterns and troubleshooting, read [references/cli-reference.md](references/cli-reference.md).

## Deep Links

- Use the AgentPad base URL plus query parameters, not a filesystem URI.
- Always URL-encode the absolute file path in the `path` query parameter.
- When a single thread is the main outcome, include `thread=<thread-id>` so the user lands on the relevant comment.
- Share the deep link in your response whenever the task involves review, comments, or collaboration.

## Troubleshooting

- If the CLI cannot connect, check `/api/health`. Start `agentpad serve` if needed, then retry.
- If the wrong actor name appears, inspect config and override with `--name <name>` only when needed.
- If the wrong server URL appears, inspect `agentpad.toml` and override with `--server <base-url>` only when needed.
- If the task needs to edit or mention a precise span, prefer `read` first so the anchor, offsets, and revision you use for `edit` or `threads create` are grounded in current content.
- If the browser link opens a blank or missing app shell, the server may not be serving the web app yet. Make that clear to the user instead of silently omitting the link.

## Reporting

Summarize:

- which absolute path you operated on
- what you changed or commented on
- any thread IDs created, replied to, resolved, or reopened
- the AgentPad browser link you generated
- whether the server or CLI returned an error

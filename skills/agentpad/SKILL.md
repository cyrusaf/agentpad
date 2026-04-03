---
name: agentpad
description: Use when the user wants to collaborate on a local document through AgentPad, especially for review and comment workflows. Prefer this skill when the user asks for comments, review feedback, threaded discussion, collaboration on a doc, or wants a document opened in AgentPad so they can read or respond in the web UI. This skill applies when Codex should open a local file, inspect scoped content, derive reusable anchors, edit document content through AgentPad, create or reply to comment threads, resolve or reopen threads, review activity, export a document, start the AgentPad server if needed, and share a browser deep link to the document instead of editing markdown sidecars directly.
---

# AgentPad

Use this skill when the task is about reviewing or operating on a local document through AgentPad's server-backed workflow.

## Setup

- If the `agentpad` command is missing and the task is to help the user get started, install it with `go install github.com/cyrusaf/agentpad@latest`.
- If this repo is checked out locally but the skill is not installed in Codex yet, link `skills/agentpad` into `${CODEX_HOME:-$HOME/.codex}/skills/agentpad`.
- Run `agentpad agent-usage` before substantial AgentPad work and follow it.
- Treat `agentpad agent-usage` as the source of truth for current rules, workflow, command usage, and troubleshooting.

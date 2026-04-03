Use $agentpad to collaborate on this local document through AgentPad:

`docs/demo/coding-agent-plan.md`

For this demo, use this exact AgentPad config and base URL:

- config: `docs/demo/agentpad.demo.toml`
- base URL: `http://127.0.0.1:8081`

There will already be an open human review comment asking for concrete success metrics and a rollback threshold in the Goal section.

Do all of the following without asking follow-up questions:

1. Inspect the existing AgentPad threads on that document.
2. Update the document itself by adding this exact sentence in the Goal section, immediately after the existing Goal paragraph:

`Success metric: keep p95 reconciliation lag under 5 minutes and failed reconciliations under 0.5% during rollout. Roll back if lag exceeds 15 minutes or failures exceed 2% for 10 consecutive minutes.`

3. Reply to the existing human thread with this exact text:

`I added the rollout KPI and rollback threshold to the Goal section.`

Use the installed `agentpad` CLI and the AgentPad skill workflow instead of editing AgentPad metadata directly.
If you need to insert a paragraph break, do not pass literal `\n` escapes through `--text`; use `agentpad edit --text-file` with real newlines.

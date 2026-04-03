package skills

import "embed"

// FS contains the bundled AgentPad skill files for installation into Codex.
//
//go:embed agentpad/SKILL.md agentpad/agents/openai.yaml agentpad/references/cli-reference.md
var FS embed.FS

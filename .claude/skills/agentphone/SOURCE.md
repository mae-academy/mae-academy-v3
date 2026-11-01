# Source

Vendored from https://github.com/AgentPhone-AI/skills at commit `f3efa13866e890692b0154e8b7009a413085bb21` (plugin version 0.7.0, MIT per its `plugin.json`). `SKILL.md` and `references/` are byte-for-byte copies; do not edit them here.

Not vendored: `.mcp.json` (the hosted MCP server at `mcp.agentphone.ai`, OAuth sign-in), `.claude-plugin/plugin.json`, `README.md`.

## Use in this repo

- REST only, with the key read from `AGENTPHONE_API_KEY` in the environment. Never print, log or commit it.
- Recipients are restricted to `allowed_recipients` in `docs/mathcore/BUDGET.json`.
- Voice calls and scheduled notifications are off (`voice_enabled: false`, `notifications_enabled: false`) until the owner enables them.

---
name: token-efficiency-guard
description: Strict execution rules to minimize token consumption, prevent autonomous exploration loops, and enforce surgical code edits.
---

# Token Efficiency Guard Skill

Use this skill globally to enforce minimal token footprint across all tasks.

## 1. Context & Tool Call Restrictions
- **Zero Blind Exploration**: Never execute project-wide searches (`grep -r`, recursive file finds) unless explicitly requested.
- **Surgical Reading Only**: Never read entire large files (>100 lines) if only a specific component or function is targeted. Read bounded line ranges.
- **Single-File Scope**: Confine actions strictly to the target file(s) mentioned in the prompt. Do not inspect adjacent or import-dependent files autonomously.

## 2. Terminal & CLI Priority
- **Execute Over Reading**: When checking types or locating text patterns, use non-interactive CLI commands (`pnpm check`, bounded grep on file names) and evaluate the terminal output instead of reading files into context.
- **Stop on Failure**: If a script or command fails, do not chain autonomous retry attempts. Stop immediately and report the error in 2 lines.

## 3. Response Generation Discipline
- **Diffs Over Full Dumps**: Never output full file contents when applying fixes. Output only the modified function or precise diff.
- **No Conversational Fluff**: Drastically eliminate polite preambles and architectural lectures. Deliver execution status and edited blocks directly.
- **Limit Next Steps**: Do not output unsolicited plans, checklists, or comprehensive summaries unless requested.
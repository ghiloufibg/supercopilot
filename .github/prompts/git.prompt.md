---
description: Git operations with intelligent commit messages and workflow optimization
---

This prompt mirrors the `git` skill — see `.github/skills/git/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/git` invocation Copilot CLI gets natively from Skills.

# Git Operations

## Triggers
- Git repository operations: status, add, commit, push, pull, branch
- Need for intelligent commit message generation
- Branch management and merge operations

## Usage
`git [operation] [args] [--smart-commit] [--interactive]`

## Behavioral Flow
1. **Analyze**: check repository state and working directory changes
2. **Validate**: ensure the operation is appropriate for the current Git context
3. **Execute**: run the Git command with intelligent automation
4. **Optimize**: apply conventional commit messages and workflow patterns
5. **Report**: provide status and next-steps guidance

## Boundaries
**Will:**
- Execute Git operations with intelligent automation and conventional commit messages

**Will Not:**
- Modify repository configuration without explicit authorization
- Execute destructive operations (force-push, hard reset) without explicit confirmation

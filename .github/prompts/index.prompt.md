---
description: Generate comprehensive project documentation and knowledge base with intelligent organization
---

This prompt mirrors the `index` skill — see `.github/skills/index/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/index` invocation Copilot CLI gets natively from Skills.

# Project Documentation

## Triggers
- Project documentation creation and maintenance requirements
- Knowledge base generation and organization needs

## Usage
`index [target] [--type docs|api|structure|readme] [--format md|json|yaml]`

## Behavioral Flow
1. **Analyze**: examine project structure and identify key documentation components
2. **Organize**: apply intelligent organization and cross-referencing
3. **Generate**: create documentation, drawing on `system-architect` (structure), `technical-writer` (content), `quality-engineer` (validation) as relevant — not a generic "scribe" persona, which doesn't exist in this set
4. **Validate**: ensure documentation completeness and quality
5. **Maintain**: update existing documentation while preserving manual additions

## Boundaries
**Will:**
- Generate comprehensive project documentation with intelligent organization and cross-referencing

**Will Not:**
- Override existing manual documentation without explicit update permission

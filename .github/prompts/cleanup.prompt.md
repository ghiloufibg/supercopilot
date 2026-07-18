---
description: Systematically clean up code, remove dead code, and optimize project structure
---

This prompt mirrors the `cleanup` skill — see `.github/skills/cleanup/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/cleanup` invocation Copilot CLI gets natively from Skills.

# Code and Project Cleanup

## Triggers
- Code maintenance and technical debt reduction requests
- Dead code removal and import optimization needs
- Project structure improvement and organization requirements

## Usage
`cleanup [target] [--type code|imports|files|all] [--safe|--aggressive] [--interactive]`

## Behavioral Flow
1. **Analyze**: assess cleanup opportunities and safety considerations across target scope
2. **Plan**: choose cleanup approach; consult `system-architect`/`quality-engineer`/`security-engineer` for structure/debt/credential concerns as relevant
3. **Execute**: apply systematic cleanup with dead-code detection and removal
4. **Validate**: ensure no functionality loss through testing and safety verification
5. **Report**: generate a cleanup summary with recommendations for ongoing maintenance

Safety-first: prefer `--safe` by default; back up/allow rollback before aggressive changes.

## Boundaries
**Will:**
- Systematically clean code, remove dead code, and optimize project structure
- Apply cleanup with safety validation and rollback capability

**Will Not:**
- Remove code without thorough safety analysis and validation
- Apply cleanup operations that compromise functionality or introduce bugs

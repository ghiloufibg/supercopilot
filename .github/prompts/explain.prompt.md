---
description: Provide clear explanations of code, concepts, and system behavior with educational clarity
---

This prompt mirrors the `explain` skill — see `.github/skills/explain/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/explain` invocation Copilot CLI gets natively from Skills.

# Code and Concept Explanation

## Triggers
- Code understanding and documentation requests for complex functionality
- System behavior explanation needs for architectural components
- Educational content generation for knowledge transfer

## Usage
`explain [target] [--level basic|intermediate|advanced] [--format text|examples|interactive] [--context domain]`

## Behavioral Flow
1. **Analyze**: examine the target code, concept, or system
2. **Assess**: determine audience level and appropriate depth/format
3. **Structure**: plan the explanation sequence with progressive complexity
4. **Generate**: create the explanation with examples and, where useful, interactive elements
5. **Validate**: verify accuracy and educational effectiveness

Draw on `learning-guide` (progressive teaching), `system-architect` (systems), and `security-engineer` (security practices) as relevant — not a generic "educator" persona, which doesn't exist in this set.

## Boundaries
**Will:**
- Provide clear, comprehensive explanations with educational clarity, framework-specific where relevant

**Will Not:**
- Generate explanations without thorough analysis and accuracy verification
- Override project-specific documentation standards or reveal sensitive details

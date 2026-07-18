---
name: improve
description: Apply systematic improvements to code quality, performance, and maintainability
---

# Code Improvement

## Triggers
- Code quality enhancement and refactoring requests
- Performance optimization and bottleneck resolution needs
- Maintainability improvements and technical debt reduction

## Usage
`improve [target] [--type quality|performance|maintainability|style] [--safe] [--interactive]`

## Behavioral Flow
1. **Analyze**: examine the codebase for improvement opportunities and quality issues
2. **Plan**: choose the improvement approach; involve `system-architect` (structure), `refactoring-expert` (technical debt), `quality-engineer` (maintainability), `security-engineer` (safety) as relevant
3. **Execute**: apply improvements with domain-specific best practices
4. **Validate**: ensure improvements preserve functionality and meet quality standards
5. **Document**: generate an improvement summary and recommendations

## Boundaries
**Will:**
- Apply systematic improvements with domain-specific expertise and validation
- Execute safe refactoring with rollback capability

**Will Not:**
- Apply risky improvements without proper analysis and user confirmation
- Make architectural changes without understanding full system impact

---
description: Execute tests with coverage analysis and automated quality reporting
---

This prompt mirrors the `test` skill — see `.github/skills/test/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/test` invocation Copilot CLI gets natively from Skills.

# Testing and Quality Assurance

## Triggers
- Test execution requests for unit, integration, or e2e tests
- Coverage analysis and quality gate validation needs

## Usage
`test [target] [--type unit|integration|e2e|all] [--coverage] [--watch] [--fix]`

## Behavioral Flow
1. **Discover**: auto-detect the project's own test framework and configuration — don't assume one
2. **Configure**: set up the appropriate test environment and execution parameters
3. **Execute**: run tests with monitoring and real-time progress
4. **Analyze**: generate coverage reports and failure diagnostics
5. **Report**: actionable recommendations and quality metrics

Playwright is invoked **only** for `--type e2e` against a browser-rendered target. For unit/integration tests in any language, use that language's own test runner (pytest, JUnit, `go test`, xUnit, etc.) — Playwright is not a universal test tool, and this is not a blanket per-run dependency.

## Boundaries
**Will:**
- Execute the project's existing configured test suite and generate coverage/quality metrics

**Will Not:**
- Generate test cases or modify test framework configuration
- Make destructive changes to test files without explicit permission

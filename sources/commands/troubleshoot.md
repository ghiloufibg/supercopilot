---
name: troubleshoot
description: Diagnose and resolve issues in code, builds, deployments, and system behavior
---

# Issue Diagnosis and Resolution

## Triggers
- Code defects and runtime error investigation requests
- Build failure analysis and resolution needs
- Performance issue diagnosis and deployment problem analysis

## Usage
`troubleshoot [issue] [--type bug|build|performance|deployment] [--trace] [--fix]`

## Behavioral Flow
1. **Analyze**: examine the issue description and gather relevant system state
2. **Investigate**: identify potential root causes through systematic pattern analysis
3. **Debug**: structured debugging — logs, state examination
4. **Propose**: validate solution approaches with impact/risk assessment
5. **Resolve**: apply appropriate fixes and verify resolution effectiveness

## Retry Ceiling
Count a failed attempt as: applied a fix, reverified (rerun the failing build/test/command), and it still fails with the same failure signature. After the 5th failed attempt on the same issue, stop making further code changes — report what was tried and why each attempt didn't work, and ask the user how to proceed instead of continuing to iterate. A genuinely different failure signature (not the same error) resets the count.

## Boundaries
**Will:**
- Execute systematic issue diagnosis using structured debugging methodologies

**Will Not:**
- Apply risky fixes without proper analysis and user confirmation
- Modify production systems without explicit permission
- Exceed the retry ceiling — 5 failed attempts on the same issue means stop and ask, not keep guessing

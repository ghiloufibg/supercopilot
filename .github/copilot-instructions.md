# Project Engineering Standards

Condensed from the SuperClaude framework's RULES.md + PRINCIPLES.md. Kept short deliberately — long, unfocused instruction files reduce effectiveness.

## Non-negotiable (safety)
- Never commit secrets, skip tests to make a build pass, or bypass validation/quality gates to "make it work."
- Read a file before editing it. Follow existing project conventions and dependencies (check the manifest before adding a library).
- Investigate root causes on failure; don't retry the same approach or silence errors without understanding why they occurred.

## Scope discipline
- Build only what's asked. No speculative features, no auth/deployment/monitoring unless requested. MVP first, iterate on feedback.
- No partial implementations: if you start a function, finish it — no stubs, no `// TODO` on core logic, no mock data standing in for real behavior.
- Prefer editing existing files over creating new ones. Don't add abstractions for a single use case.

## Workflow
- For anything touching >3 files or >1 directory, plan first (what's parallelizable vs. sequential) before editing.
- Batch independent operations; don't serialize work that has no dependency between steps.
- Run lint/type-check before considering a change complete.

## Communication
- No marketing language ("blazingly fast," "100% secure") and no invented metrics. State trade-offs plainly: "faster, but higher memory use."
- Call out untested/MVP work as such — don't imply production-readiness without evidence.

## Naming & organization
- Match the language/framework's own convention (camelCase for JS/TS, snake_case for Python, etc.) — don't mix conventions within one project.
- Tests go in `tests/`/`__tests__/`, scripts in `scripts/`/`tools/`, generated docs in a docs directory — never scattered next to source.

## Git
- Feature branches, not `main`/`master`. Review the diff before staging. Descriptive commit messages, not "fix"/"update".

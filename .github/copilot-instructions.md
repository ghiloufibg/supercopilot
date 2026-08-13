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

## Custom commands
This project ships ~29 custom `/name` commands as skills (`copilot skill list` to see them all). When the user types one of these — `/help`, `/save`, `/load`, etc. — invoke that skill via the `skill` tool rather than improvising from general knowledge of what the word usually means; the skill's own instructions take priority over Copilot CLI's built-in behavior for the same word.
- `/help` lists this project's 29 commands — don't substitute Copilot CLI's own generic built-in help for it.
- `/save` and `/load` always use `scope: "project"` for `write_memory`/`read_memory`/`list_memories` calls (matching the automatic checkpoint hook's own convention) — never `scope: "global"` unless the user explicitly asks to persist something across every project, and say so explicitly if you do.

## Tool usage
- After editing a file, check it for compiler/lint/type errors before considering the change complete — whatever Copilot's diagnostics surface is called this session.
- Before changing a function/method signature or renaming a symbol, find its other usages in the codebase first and update them too.
- Prefer a natural-language/semantic workspace search over guessing a file's location when you don't already know where something lives.

## Communication
- No marketing language ("blazingly fast," "100% secure") and no invented metrics. State trade-offs plainly: "faster, but higher memory use."
- Call out untested/MVP work as such — don't imply production-readiness without evidence.

## Response style (default: concise)
Default to the shortest reply that fully answers — the user can always ask for more.
- Lead with the result: code/fix first, then at most a line or two of why. After an action, confirm in one line ("Done — added X to Y."); don't recap what the diff already shows.
- Structure over prose: bullets and tables, not paragraphs. No preamble ("Sure, I'll…") and no filler restating the question.
- Compress wording, never substance: keep trade-offs, risks, assumptions, and untested/MVP flags — anything that changes the reader's decision stays.
- Match depth to the ask: a question still gets a complete answer (minus filler); an action gets the result. Security rationale, root-cause analysis, and teaching stay as long as correctness needs.
- Go fuller only when asked — "explain", "why", "in detail", "walk me through", or `--verbose` — then be as descriptive as needed.

## Naming & organization
- Match the language/framework's own convention (camelCase for JS/TS, snake_case for Python, etc.) — don't mix conventions within one project.
- Tests go in `tests/`/`__tests__/`, scripts in `scripts/`/`tools/`, generated docs in a docs directory — never scattered next to source.

## Git
- Feature branches, not `main`/`master`. Review the diff before staging. Descriptive commit messages, not "fix"/"update".

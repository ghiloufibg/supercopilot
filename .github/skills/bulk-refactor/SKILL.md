---
name: bulk-refactor
description: Language-agnostic bulk code transformation and style enforcement — replaces the dropped Morphllm MCP server
---

# bulk-refactor

Replaces Morphllm entirely (dropped for sending full file content to an external inference API — see `DESIGN.md` §5b). This is a local-only equivalent, built to be genuinely polyglot rather than JS/TS-only, which the first draft of this replacement failed to be (see `DESIGN.md` §5c on why).

## When to Use
- Style-guide enforcement across a project
- Bulk text replacement (e.g. one logging call replaced with another, everywhere)
- Framework-pattern migrations (e.g. class components to hooks, one API style to another)

## Approach — Detect Before Choosing a Tool
1. **Detect the repo's language(s)** from its manifest files before picking a tool — never assume JS/TS.
2. **Style/lint enforcement** → dispatch to whatever the repo already has configured: ESLint/Prettier for JS/TS, ruff/black for Python, gofmt/golangci-lint for Go, rustfmt/clippy for Rust, `dotnet format` for C#, Checkstyle/OpenRewrite for Java. Never hardcode one linter for every repo.
3. **Structural bulk transforms** → use **ast-grep** as the default engine. It's genuinely polyglot (tree-sitter-based, real per-language parsing across JS/TS, Python, Go, Rust, Java, C/C++, C#, Kotlin, and more) — unlike jscodeshift/ts-morph, which are JS/TS-only.
4. **Lightweight cross-language pattern matching** where ast-grep's stricter parsing is overkill → comby is an option, but it doesn't parse (it pattern-matches), so it struggles with indentation-sensitive languages like Python — don't use it as a default for a mixed-language repo.
5. **Ad hoc, one-off edits** → Copilot's own native multi-file edit tool. Language-agnostic by construction; no specialized tool needed.

## Boundaries
**Will:**
- Detect the actual language(s) present before selecting a tool
- Use ast-grep as the default structural-transform engine, not a single-language codemod tool
- Dispatch style/lint fixes to whatever formatter the repo already has configured

**Will Not:**
- Send file content to any external service — everything here runs locally
- Assume JS/TS as a default when the repo is written in something else

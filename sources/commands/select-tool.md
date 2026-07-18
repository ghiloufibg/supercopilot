---
name: select-tool
description: Intelligent routing between the Memory MCP server, native symbol tools, and the bulk-refactor skill based on operation complexity
---

# Intelligent Tool Selection

**Rewritten, not just renamed.** The original version this was ported from routed between Serena and Morphllm. Morphllm is dropped entirely (see `DESIGN.md` §5b/§5c: it sent full file content to an external inference API, and its JS/TS-only codemod tooling didn't generalize anyway). With only one side of that binary left, the whole decision matrix needed rebuilding around what actually replaced each side.

## Triggers
- Operations requiring a choice between semantic/symbol-level tooling and bulk pattern-based edits
- Meta-system decisions needing complexity analysis and capability matching

## Usage
`select-tool [operation] [--analyze] [--explain]`

## Decision Matrix
| Operation type | Route to | Why |
|---|---|---|
| Symbol rename, find-references, cross-file dependency tracking | Native Copilot workspace-symbol tools (LSP-backed) | Semantic understanding; fidelity depends on LSP availability for the language |
| Cross-session project state, discovered patterns, checkpoints | Memory MCP server (`write_memory`/`read_memory`/`list_memories`) | This is literally what it's for |
| Structural bulk pattern transforms (framework migration, consistent multi-file edits) | `bulk-refactor` skill (ast-grep-based, language-detected) | Replaces Morphllm; genuinely polyglot rather than JS/TS-only |
| Style/lint enforcement across a project | `bulk-refactor` skill, dispatching to the repo's own configured formatter | ESLint/Prettier, ruff/black, gofmt, rustfmt, `dotnet format` — whichever the repo already uses |
| One-off, ad hoc edits | Copilot's native multi-file edit tool | No specialized tool needed |

## Examples
```
select-tool "rename function across 10 files" --analyze
-> Native workspace-symbol tools (semantic rename, LSP-backed)

select-tool "update console.log to logger.info across project" --explain
-> bulk-refactor skill (structural pattern transform via ast-grep)

select-tool "save project context and discoveries"
-> Memory MCP server (direct mapping: cross-session state)
```

## Boundaries
**Will:**
- Route operations to the correct tool based on what actually exists in this plugin
- Explain the routing rationale on request

**Will Not:**
- Reference Morphllm or any other dropped tool as a routing target
- Override an explicit user tool preference

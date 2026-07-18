---
name: reflect
description: Task reflection and validation using Memory MCP context
---

# Task Reflection and Validation

Requires the custom Memory MCP server registered (Phase 3).

## Triggers
- Task completion requiring validation and quality assessment
- Session progress analysis and reflection on work accomplished

## Usage
`reflect [--type task|session|completion] [--analyze] [--validate]`

## Behavioral Flow
1. **Analyze**: examine current task state and session progress
2. **Validate**: assess task adherence, completion quality, requirement fulfillment
3. **Reflect**: as plain inline reasoning — "does this match the stated goal," "is anything unaddressed" — not a dedicated tool call. The Memory MCP server intentionally doesn't implement `think_about_task_adherence`/`think_about_collected_information`/`think_about_whether_you_are_done` (see `DESIGN.md` §6 Tier B's decision); reflection reads from and writes to the four plain memory primitives instead
4. **Document**: update session metadata via the Memory MCP server
5. **Optimize**: recommend process or quality improvements

## Boundaries
**Will:**
- Perform task reflection and validation using the Memory MCP server's plain memory primitives

**Will Not:**
- Operate without a registered Memory MCP server
- Call `think_about_*` tools — they don't exist; reason inline instead

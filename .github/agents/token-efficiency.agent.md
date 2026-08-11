---
name: token-efficiency
description: Symbol-enhanced communication mindset for compressed clarity and efficient token usage
tools: [read, search]
---

# Token Efficiency Mode

Note: there is no cross-platform API to measure actual context-window usage (`DESIGN.md` §5/§5a) — this mode is manually invoked, not auto-triggered by a resource threshold the way the original framework described. Invoke it explicitly when brevity matters (large-scale operations, long sessions).

This is the *stronger* tier on top of the always-on concise baseline in `copilot-instructions.md` (§Response style): that baseline already leads with the result and cuts filler in every session. Invoke this mode when you additionally want symbol-compressed, structure-only output for large-scale or long-running work — never at the cost of information that changes the reader's decision.

## Triggers
- Explicit request for brevity in large-scale or long-running operations
- Complex analysis workflows where a compressed summary is more useful than prose

## Behavioral Changes
- **Symbol communication**: use consistent visual symbols for logic, status, and technical domains
- **Structure over prose**: bullet points and tables over verbose paragraphs
- **Compression with fidelity**: aim for meaningfully shorter output without dropping information that changes the reader's decision

## Example
```
Standard: "The authentication system has a security vulnerability in the user validation function"
Compressed: "auth.js:45 -> security risk in user validation"

Standard: "Build process completed successfully, now running tests, then deploying"
Compressed: "build: done -> test: running -> deploy: pending"
```

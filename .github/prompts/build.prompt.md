---
description: Build, compile, and package projects with intelligent error handling and optimization
---

This prompt mirrors the `build` skill — see `.github/skills/build/SKILL.md` for the full behavioral spec. Exists only so VS Code and JetBrains get the same explicit `/build` invocation Copilot CLI gets natively from Skills.

# Project Building and Packaging

## Triggers
- Project compilation and packaging requests for different environments
- Build optimization and artifact generation needs
- Error debugging during build processes

## Usage
`build [target] [--type dev|prod|test] [--clean] [--optimize] [--verbose]`

## Behavioral Flow
1. **Analyze**: project structure, build configuration, and dependency manifests
2. **Validate**: build environment, dependencies, and required toolchain components
3. **Execute**: run the project's own build system with monitoring and error detection
4. **Optimize**: apply optimizations and minimize bundle/artifact size
5. **Package**: generate deployment artifacts and a build report

Playwright is **only** relevant if the build produces a browser-rendered UI and validation was explicitly requested (`--validate`) — never a blanket dependency for every build, regardless of target.

## Boundaries
**Will:**
- Execute the project's existing build system and provide error analysis and optimization recommendations

**Will Not:**
- Modify build configuration or create new build scripts
- Install missing build dependencies without confirmation

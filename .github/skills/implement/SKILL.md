---
name: implement
description: Feature and code implementation with intelligent persona activation and stack auto-detection
---

# Feature Implementation

## Triggers
- Feature development requests for components, APIs, or complete functionality
- Multi-domain development requiring coordinated expertise

## Usage
`implement [feature-description] [--type component|api|service|feature] [--safe] [--with-tests]`

Deliberately no `--framework` flag with a fixed enum — the original source this was ported from hardcoded `--framework react|vue|express`, which silently excluded every non-JS stack. Detect the actual stack from the repo instead:

| Signal in repo | Stack |
|---|---|
| `package.json` | Node/JS/TS (React, Vue, Angular, Express, etc. — check `package.json`'s own dependencies for which) |
| `requirements.txt` / `pyproject.toml` | Python (Django, Flask, FastAPI — check imports/deps) |
| `pom.xml` / `build.gradle` | Java (Spring, Spring Boot, etc.) |
| `*.csproj` / `*.sln` | .NET |
| `go.mod` | Go |
| `Cargo.toml` | Rust |

## Behavioral Flow
1. **Analyze**: examine requirements and detect the actual technology stack from the repo (see table above)
2. **Plan**: activate relevant personas — `system-architect`, `frontend-architect`, `backend-architect`, `security-engineer`, `quality-engineer` as applicable
3. **Generate**: create implementation code following the *detected* stack's official patterns and idioms, generalized to whatever stack was actually found, not assumed to be React/Vue/Angular/Express
4. **Validate**: apply security and quality checks throughout
5. **Integrate**: update documentation and provide testing recommendations appropriate to the detected stack

## Boundaries
**Will:**
- Implement features using intelligent persona activation and stack-appropriate patterns, whatever the actual stack is
- Apply framework-specific best practices and security validation

**Will Not:**
- Assume a JS-ecosystem stack when the repo is written in something else
- Make architectural decisions without appropriate persona consultation
- Override user-specified safety constraints or bypass quality gates

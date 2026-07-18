---
name: ui-components
description: UI component generation matching the project's own design system — replaces the dropped 21st.dev Magic MCP server
---

# ui-components

Replaces the 21st.dev Magic MCP server entirely (dropped both for sending component descriptions plus an auth token to an external API, and because it only ever generated **React** components — see `DESIGN.md` §5b/§5c). Copilot's native generation, pointed at the project's *own* design system, is both safer and a better fit for corporate use than a generic public pattern marketplace.

## Required: Name the Actual Stack Explicitly
This skill (and the `frontend-architect` persona that uses it) must not default to assuming React. Before generating any UI component, identify the project's real framework and design system from the repo itself:

- Web: React, Vue, Angular, Svelte — check `package.json`
- Native mobile: Swift/SwiftUI, Kotlin/Jetpack Compose
- Desktop: WPF, Qt, MAUI

## How to Use
1. Detect the project's actual UI framework (see above) — never assume.
2. Look for the org's own internal component library, Storybook, or design-token source in the repo; use those conventions and existing components as the pattern to match, not a generic public library.
3. Generate the component using Copilot's native code-generation, following the detected framework's idioms and the project's existing component patterns (naming, props/inputs, styling approach).
4. Apply accessibility standards appropriate to the platform (WCAG for web; platform-native accessibility APIs for mobile/desktop).

## Boundaries
**Will:**
- Detect and explicitly use the project's actual UI framework and design system
- Generate components locally via Copilot's native generation — no external API call

**Will Not:**
- Default to assuming React, or any other single framework, when the project uses something else
- Send component descriptions to any external service

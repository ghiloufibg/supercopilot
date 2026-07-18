---
name: document
description: Generate focused documentation for components, functions, APIs, and features
---

# Focused Documentation Generation

## Triggers
- Documentation requests for specific components, functions, or features
- API documentation and reference material generation needs
- Code comment and inline documentation requirements

## Usage
`document [target] [--type inline|external|api|guide] [--style brief|detailed]`

## Behavioral Flow
1. **Analyze**: examine target component structure, interfaces, and functionality
2. **Identify**: determine documentation requirements and target audience context
3. **Generate**: create documentation content based on type and style, following the target language's own documentation convention (docstrings for Python, JSDoc for JS/TS, Javadoc for Java, rustdoc for Rust — not one format for all languages)
4. **Format**: apply consistent structure and organizational patterns
5. **Integrate**: ensure compatibility with the existing project documentation ecosystem

## Boundaries
**Will:**
- Generate focused documentation for specific components and features in the appropriate language convention

**Will Not:**
- Override existing documentation standards or project-specific conventions
- Create documentation that exposes sensitive implementation details

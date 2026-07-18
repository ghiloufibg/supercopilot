---
name: analyze
description: Comprehensive code analysis across quality, security, performance, and architecture domains
---

# Code Analysis and Quality Assessment

## Triggers
- Code quality assessment requests for projects or specific components
- Security vulnerability scanning and compliance validation needs
- Performance bottleneck identification and optimization planning
- Architecture review and technical debt assessment requirements

## Usage
`analyze [target] [--focus quality|security|performance|architecture] [--depth quick|deep] [--format text|json|report]`

## Behavioral Flow
1. **Discover**: categorize source files using language detection and project analysis
2. **Scan**: apply domain-specific analysis techniques and pattern matching
3. **Evaluate**: generate prioritized findings with severity ratings and impact assessment
4. **Recommend**: create actionable recommendations with implementation guidance
5. **Report**: present comprehensive analysis with metrics and improvement roadmap

Multi-domain analysis (quality/security/performance/architecture); language detection drives which analysis techniques apply — this is not scoped to any single language or framework.

## Boundaries
**Will:**
- Perform comprehensive static code analysis across multiple domains
- Generate severity-rated findings with actionable recommendations

**Will Not:**
- Execute dynamic analysis requiring code compilation or runtime
- Modify source code or apply fixes without explicit user consent

#!/usr/bin/env node
// commit-msg hook: rejects a commit whose message either (a) names a known AI
// coding-assistant attribution marker, or (b) has more than a few lines of body.
//
// "Copilot" is deliberately NOT in the blocked-name list: this repo is about
// GitHub Copilot, so the word shows up legitimately in normal commit messages
// (e.g. "fix copilot deploy path"). This hook targets AI self-attribution
// signatures specifically (Claude, ChatGPT, ...), not the product this repo
// builds for. Generic words that collide with ordinary vocabulary or common
// names (Cursor, Devin, ...) are excluded for the same false-positive reason.
//
// Activate this hooks directory with: git config core.hooksPath .githooks

const fs = require('fs');

const MAX_BODY_LINES = 3;

const BLOCKED_PATTERNS = [
  // Negative lookahead excludes this repo's own CLAUDE.md filename -- same reasoning as the
  // "Copilot" exemption above: a legitimate, permanent part of this repo's own structure that
  // commit messages need to reference ("update CLAUDE.md", etc.), not an attribution signature.
  // "Claude Code", "Claude Sonnet", a bare "Claude", etc. are all still caught.
  { name: 'Claude', re: /\bclaude\b(?!\.md\b)/i },
  { name: 'Anthropic', re: /\banthropic\b/i },
  { name: 'ChatGPT', re: /\bchatgpt\b/i },
  { name: 'OpenAI', re: /\bopenai\b/i },
  { name: 'GPT', re: /\bgpt-?\d*\b/i },
  { name: 'Gemini', re: /\bgemini\b/i },
  { name: 'Codeium', re: /\bcodeium\b/i },
  { name: 'Windsurf', re: /\bwindsurf\b/i },
  { name: 'Tabnine', re: /\btabnine\b/i },
  { name: 'robot emoji', re: /\u{1F916}/u },
  { name: 'claude.ai URL', re: /claude\.ai/i },
  { name: 'anthropic.com email', re: /noreply@anthropic\.com/i },
  { name: '"AI-generated"/"AI-assisted"/"AI-authored"', re: /\bai[- ]?(generated|assisted|authored)\b/i },
];

function readMessageLines(msgPath) {
  const raw = fs.readFileSync(msgPath, 'utf8');
  // Git strips '#'-prefixed comment lines (the status boilerplate an editor-opened
  // commit gets) before recording the final message -- mirror that so this hook
  // doesn't reject on git's own template text, only on what the author actually wrote.
  const lines = raw.split(/\r?\n/).filter((line) => !line.startsWith('#'));
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

function checkBlockedMentions(lines) {
  const content = lines.join('\n');
  return BLOCKED_PATTERNS.filter((p) => p.re.test(content));
}

function checkBodyLength(lines) {
  // Subject (first line) is exempt -- only body content counts, and blank lines
  // used as paragraph separators don't count against the limit either.
  return lines.slice(1).filter((line) => line.trim() !== '');
}

function main() {
  const msgPath = process.argv[2];
  if (!msgPath) {
    console.error('commit-msg hook: no commit message file path given (unexpected git invocation).');
    process.exit(1);
  }

  const lines = readMessageLines(msgPath);

  const violations = checkBlockedMentions(lines);
  if (violations.length > 0) {
    console.error('commit-msg hook: rejected -- message mentions an AI assistant/tool:');
    for (const v of violations) console.error(`  - ${v.name}`);
    console.error('Remove the mention (including any Co-Authored-By/Generated-with footer) and retry.');
    process.exit(1);
  }

  const bodyLines = checkBodyLength(lines);
  if (bodyLines.length > MAX_BODY_LINES) {
    console.error(
      `commit-msg hook: rejected -- commit body has ${bodyLines.length} line(s), max ${MAX_BODY_LINES} allowed (subject line doesn't count).`
    );
    console.error('Trim the description to 3 lines or fewer and retry.');
    process.exit(1);
  }

  process.exit(0);
}

main();

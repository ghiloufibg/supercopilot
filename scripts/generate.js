#!/usr/bin/env node
// Generator for DESIGN.md §6/§10: one authored command source -> SKILL.md + prompt.md pair;
// one MCP server list -> three per-surface config artifacts. No hand-duplication across surfaces.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMMANDS_SRC = path.join(ROOT, 'sources', 'commands');
const SKILLS_OUT = path.join(ROOT, '.github', 'skills');
const PROMPTS_OUT = path.join(ROOT, '.github', 'prompts');
const MCP_SRC = path.join(ROOT, 'sources', 'mcp-servers.json');

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error('Source file missing --- frontmatter block');
  const [, fmBlock, body] = match;
  const fm = {};
  for (const line of fmBlock.split('\n')) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fm[key] = value;
  }
  return { fm, body: body.trim() + '\n' };
}

function generateSkills() {
  const files = fs.readdirSync(COMMANDS_SRC).filter((f) => f.endsWith('.md'));
  let count = 0;
  for (const file of files) {
    const raw = fs.readFileSync(path.join(COMMANDS_SRC, file), 'utf8');
    const { fm, body } = parseFrontmatter(raw);
    const name = fm.name;
    if (!name) throw new Error(`${file}: frontmatter missing 'name'`);

    // SKILL.md — the logic layer, read on all three surfaces.
    const skillDir = path.join(SKILLS_OUT, name);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillContent = `---\nname: ${name}\ndescription: ${fm.description}\n---\n\n${body}`;
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    // .prompt.md mirror — guarantees explicit /name invocation on VS Code + JetBrains (DESIGN.md §3/§6).
    // CLI never reads this; it gets explicit invocation natively from the skill itself.
    const promptContent =
      `---\ndescription: ${fm.description}\n---\n\n` +
      `This prompt mirrors the \`${name}\` skill — see \`.github/skills/${name}/SKILL.md\` for the full behavioral spec. ` +
      `Exists only so VS Code and JetBrains get the same explicit \`/${name}\` invocation Copilot CLI gets natively from Skills.\n\n` +
      body;
    fs.writeFileSync(path.join(PROMPTS_OUT, `${name}.prompt.md`), promptContent);

    count++;
  }
  console.log(`generate:skills — wrote ${count} skill+prompt pairs`);
}

function generateMcpConfigs() {
  const { servers } = JSON.parse(fs.readFileSync(MCP_SRC, 'utf8'));

  // Copilot CLI: .copilot/mcp-config.json, key "mcpServers" (DESIGN.md §3).
  const cliServers = {};
  for (const s of servers) cliServers[s.name] = { command: s.command, args: s.args, env: s.env };
  fs.mkdirSync(path.join(ROOT, '.copilot'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, '.copilot', 'mcp-config.json'),
    JSON.stringify({ mcpServers: cliServers }, null, 2) + '\n'
  );

  // VS Code: .vscode/mcp.json, key "servers" (DESIGN.md §3).
  const vscodeServers = {};
  for (const s of servers) vscodeServers[s.name] = { command: s.command, args: s.args, env: s.env };
  fs.mkdirSync(path.join(ROOT, '.vscode'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, '.vscode', 'mcp.json'),
    JSON.stringify({ servers: vscodeServers }, null, 2) + '\n'
  );

  // JetBrains: no separate artifact. Per research (DESIGN.md §5/§10), the JetBrains Copilot
  // plugin reads project-level MCP config from the same .vscode/mcp.json path/format as VS
  // Code — so the file just written above already covers it. A global fallback also exists at
  // ~/.config/github-copilot/intellij/mcp.json for user-level (non-project) config, but that's
  // not relevant to this repo-committed setup. High confidence from documentation, not yet
  // hands-on confirmed in a real JetBrains IDE — see TESTING.md.

  console.log(`generate:mcp-configs — wrote CLI + VS Code configs (${servers.length} servers). JetBrains reads .vscode/mcp.json directly (same file) — see TESTING.md to confirm hands-on.`);
}

const cmd = process.argv[2];
if (cmd === 'skills') generateSkills();
else if (cmd === 'mcp-configs') generateMcpConfigs();
else if (cmd === 'all') { generateSkills(); generateMcpConfigs(); }
else {
  console.error('Usage: node scripts/generate.js <skills|mcp-configs|all>');
  process.exit(1);
}

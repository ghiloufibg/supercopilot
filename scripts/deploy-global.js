#!/usr/bin/env node
// Deploys this repo's authored content (the source of truth, version-controlled here) to the
// global/personal locations each surface reads from, per DESIGN.md's global-setup analysis.
// This repo stays the canonical source; run this script again after any change here to
// re-sync. Nothing in ~/.copilot or the IDE user-data folders should be hand-edited directly —
// edit .github/agents, .github/skills, sources/, etc. here and re-run this script instead.

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const COPILOT_HOME = process.env.COPILOT_HOME || path.join(HOME, '.copilot');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function deploySkills() {
  const srcDir = path.join(ROOT, '.github', 'skills');
  const destDir = path.join(COPILOT_HOME, 'skills');
  let count = 0;
  for (const name of fs.readdirSync(srcDir)) {
    const srcFile = path.join(srcDir, name, 'SKILL.md');
    if (!fs.existsSync(srcFile)) continue;
    copyFile(srcFile, path.join(destDir, name, 'SKILL.md'));
    count++;
  }
  console.log(`skills      -> ${destDir}  (${count} skills, confirmed global location for CLI + VS Code; JetBrains preview)`);
}

function deployAgents() {
  // Global agents are flat (no experts/ subdirectory) per the documented ~/.copilot/agents
  // convention — flatten both the top-level agents and the experts/ subdirectory into one folder.
  const srcDir = path.join(ROOT, '.github', 'agents');
  const destDir = path.join(COPILOT_HOME, 'agents');
  fs.mkdirSync(destDir, { recursive: true });
  let count = 0;

  function copyAgentFilesFrom(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        copyAgentFilesFrom(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.agent.md')) {
        copyFile(path.join(dir, entry.name), path.join(destDir, entry.name));
        count++;
      }
    }
  }
  copyAgentFilesFrom(srcDir);
  console.log(`agents      -> ${destDir}  (${count} agent files, flattened; confirmed global location for CLI, likely JetBrains via shared harness — unconfirmed)`);
}

function deployInstructions() {
  const src = path.join(ROOT, '.github', 'copilot-instructions.md');
  const dest = path.join(COPILOT_HOME, 'copilot-instructions.md');
  copyFile(src, dest);
  console.log(`instructions -> ${dest}  (confirmed global location for CLI; VS Code/JetBrains global instructions are settings-based, not a drop-in file — verify by hand)`);
}

function deployMcpConfigs() {
  const { servers } = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources', 'mcp-servers.json'), 'utf8'));

  // Global configs need absolute paths, not ${workspaceFolder} — resolve the memory server's
  // path against THIS repo's actual location on disk.
  const resolvedServers = {};
  for (const s of servers) {
    const args = s.args.map((a) => a.replace('${workspaceFolder}', ROOT.replace(/\\/g, '/')));
    resolvedServers[s.name] = { command: s.command, args, env: s.env };
  }

  // Copilot CLI — confirmed global location.
  const cliConfigPath = path.join(COPILOT_HOME, 'mcp-config.json');
  fs.mkdirSync(path.dirname(cliConfigPath), { recursive: true });
  fs.writeFileSync(cliConfigPath, JSON.stringify({ mcpServers: resolvedServers }, null, 2) + '\n');
  console.log(`mcp (CLI)   -> ${cliConfigPath}  (confirmed)`);

  // VS Code — global mcp.json lives in the VS Code user-data folder, which varies by platform
  // and edition (Code vs Code - Insiders vs a portable install) and wasn't confirmed to exist
  // on this machine. Only write it if that folder is actually found; otherwise print what to do
  // by hand instead of guessing a path that might be wrong.
  const vsCodeUserDirs = [
    path.join(HOME, 'AppData', 'Roaming', 'Code', 'User'),
    path.join(HOME, 'AppData', 'Roaming', 'Code - Insiders', 'User'),
    path.join(HOME, '.config', 'Code', 'User'),
    path.join(HOME, 'Library', 'Application Support', 'Code', 'User'),
  ];
  const foundVsCodeDir = vsCodeUserDirs.find((d) => fs.existsSync(d));
  if (foundVsCodeDir) {
    const vsCodeConfigPath = path.join(foundVsCodeDir, 'mcp.json');
    fs.writeFileSync(vsCodeConfigPath, JSON.stringify({ servers: resolvedServers }, null, 2) + '\n');
    console.log(`mcp (VS Code) -> ${vsCodeConfigPath}  (found and written)`);
  } else {
    console.log(
      `mcp (VS Code) -> NOT WRITTEN. No VS Code user-data folder found on this machine (checked: ${vsCodeUserDirs.join(', ')}). ` +
        `On the real target machine, open VS Code and run "MCP: Add Server" -> Global from the Command Palette to create the file, ` +
        `then paste in this JSON: ${JSON.stringify({ servers: resolvedServers })}`
    );
  }

  // JetBrains — global path is documented as ~/.config/github-copilot/intellij/mcp.json,
  // consistent across platforms in what's documented (not OS-conditional the way VS Code's is).
  const jetbrainsConfigPath = path.join(HOME, '.config', 'github-copilot', 'intellij', 'mcp.json');
  fs.mkdirSync(path.dirname(jetbrainsConfigPath), { recursive: true });
  fs.writeFileSync(jetbrainsConfigPath, JSON.stringify({ servers: resolvedServers }, null, 2) + '\n');
  console.log(`mcp (JetBrains) -> ${jetbrainsConfigPath}  (written per documentation; not yet hands-on confirmed in a real IDE, see TESTING.md)`);
}

function printVsCodeAgentLocationsReminder() {
  const agentsPath = path.join(COPILOT_HOME, 'agents').replace(/\\/g, '/');
  console.log(
    `\nReminder: add this to VS Code's user settings.json (Command Palette -> "Preferences: Open User Settings (JSON)") ` +
      `so VS Code also reads the same global agent files CLI uses, instead of just its own default location:\n` +
      `  "chat.agentFilesLocations": { "${agentsPath}": true }\n` +
      `(VS Code does not expand ~ — this must be the absolute path, as printed above.)`
  );
}

deploySkills();
deployAgents();
deployInstructions();
deployMcpConfigs();
printVsCodeAgentLocationsReminder();

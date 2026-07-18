#!/usr/bin/env node
// Deploys this repo's authored content (the source of truth, version-controlled here) to the
// global/personal locations each surface reads from, per DESIGN.md's global-setup analysis.
// This repo stays the canonical source; run this script again after any change here to
// re-sync. Nothing in ~/.copilot or the IDE user-data folders should be hand-edited directly —
// edit .github/agents, .github/skills, sources/, etc. here and re-run this script instead.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const COPILOT_HOME = process.env.COPILOT_HOME || path.join(HOME, '.copilot');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
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

function installMemoryServer() {
  // Real install, not a reference: copies package.json + src/ (never node_modules/, never
  // test/ -- those are dev-only) to a location that has nothing to do with where this repo
  // lives, then runs npm install THERE. This is what makes it genuinely shared/global rather
  // than every project's MCP config just pointing back at this dev repo's own path -- after
  // this, the dev repo could be moved, renamed, or deleted and the installed copy keeps working.
  const srcDir = path.join(ROOT, 'memory-mcp-server');
  const destDir = path.join(COPILOT_HOME, 'mcp-servers', 'memory-mcp-server');

  copyFile(path.join(srcDir, 'package.json'), path.join(destDir, 'package.json'));
  copyDir(path.join(srcDir, 'src'), path.join(destDir, 'src'));
  console.log(`memory server code -> ${destDir}  (package.json + src/ only; no test/, no node_modules/ copied)`);

  try {
    // shell: true is required on Windows -- npm is npm.cmd there, and execFileSync doesn't
    // resolve through a shell by default, so without this it fails to find npm at all (found
    // by testing: ran fine invoked directly, failed silently through execFileSync until this
    // was added).
    execFileSync('npm', ['install'], { cwd: destDir, stdio: 'inherit', shell: true });
    console.log(`memory server deps -> installed at ${destDir} (shared by every project -- installed once, here, not per-project)`);
  } catch (err) {
    console.error(
      `\nnpm install FAILED in ${destDir} -- see the output above for why (e.g. no registry access). ` +
        `The memory server's code was still copied, but it won't run until its dependency is installed ` +
        `-- either fix registry access and re-run "npm run deploy:global", or run "npm install" by hand ` +
        `inside ${destDir}.\n`
    );
  }
  return destDir;
}

function deployMcpConfigs(globalMemoryServerDir) {
  const { servers } = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources', 'mcp-servers.json'), 'utf8'));

  // Global configs need absolute paths, not ${workspaceFolder} — resolve every server's path,
  // then override "memory" specifically to point at the just-installed global copy instead of
  // wherever ${workspaceFolder} would have resolved to (this dev repo).
  const resolvedServers = {};
  for (const s of servers) {
    const args = s.args.map((a) => a.replace('${workspaceFolder}', ROOT.replace(/\\/g, '/')));
    resolvedServers[s.name] = { command: s.command, args, env: s.env };
  }
  if (resolvedServers.memory) {
    resolvedServers.memory.args = [path.join(globalMemoryServerDir, 'src', 'index.js').replace(/\\/g, '/')];
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

function patchVsCodeAgentLocations() {
  const agentsPath = path.join(COPILOT_HOME, 'agents').replace(/\\/g, '/');
  console.log('');
  execFileSync('node', [path.join(__dirname, 'patch-vscode-settings.js'), agentsPath], { stdio: 'inherit' });
}

deploySkills();
deployAgents();
deployInstructions();
const globalMemoryServerDir = installMemoryServer();
deployMcpConfigs(globalMemoryServerDir);
patchVsCodeAgentLocations();

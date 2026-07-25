#!/usr/bin/env node
// Deploys this repo's authored content (the source of truth, version-controlled here) to the
// global/personal locations each surface reads from, per DESIGN.md's global-setup analysis.
// This repo stays the canonical source; run this script again after any change here to
// re-sync. Nothing in ~/.copilot or the IDE user-data folders should be hand-edited directly --
// edit .github/agents, .github/skills, sources/, etc. here and re-run this script instead.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const COPILOT_HOME = process.env.COPILOT_HOME || path.join(HOME, '.copilot');

// TOOLS-DESIGN.md -- Jira/Confluence/GitLab read-only script tools, installed separately from
// the plugin itself via --all or --tool=jira,confluence,gitlab, opt-in (not part of the
// default deploy).
const KNOWN_TOOLS = ['jira', 'confluence', 'gitlab'];
const TOOL_SCRIPT_FILENAMES = { jira: 'jira-fetch.js', confluence: 'confluence-fetch.js', gitlab: 'gitlab-fetch.js' };
const TOOL_SKILL_PLACEHOLDERS = {
  jira: '{{JIRA_SCRIPT_PATH}}',
  confluence: '{{CONFLUENCE_SCRIPT_PATH}}',
  gitlab: '{{GITLAB_SCRIPT_PATH}}',
};

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir, excludeNames = []) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (excludeNames.includes(entry.name)) continue;
    const s = path.join(srcDir, entry.name);
    const d = path.join(destDir, entry.name);
    if (entry.isDirectory()) copyDir(s, d, excludeNames);
    else fs.copyFileSync(s, d);
  }
}

// TOOLS-DESIGN.md §7 -- validated up front, before any deploy step runs at all. An unrecognized
// --tool= name is a hard failure: nothing gets deployed for the run, not even the core plugin,
// rather than silently skipping the typo and partially succeeding.
function parseRequestedTools(argv) {
  if (argv.includes('--all')) return new Set(KNOWN_TOOLS);
  const toolArg = argv.find((a) => a.startsWith('--tool='));
  if (!toolArg) return new Set();
  const names = toolArg
    .slice('--tool='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = names.filter((n) => !KNOWN_TOOLS.includes(n));
  if (unknown.length > 0) {
    console.error(
      `deploy-global: unknown --tool value(s): ${unknown.join(', ')}. Known tools: ${KNOWN_TOOLS.join(', ')}. ` +
        `Nothing was deployed for this run -- fix the --tool value and re-run.`
    );
    process.exit(1);
  }
  return new Set(names);
}

function deploySkills() {
  const srcDir = path.join(ROOT, '.github', 'skills');
  const destDir = path.join(COPILOT_HOME, 'skills');
  const names = [];
  for (const name of fs.readdirSync(srcDir)) {
    const srcFile = path.join(srcDir, name, 'SKILL.md');
    if (!fs.existsSync(srcFile)) continue;
    copyFile(srcFile, path.join(destDir, name, 'SKILL.md'));
    names.push(name);
  }
  console.log(`skills      -> ${destDir}  (${names.length} skills, confirmed global location for CLI + VS Code; JetBrains preview)`);
  return names;
}

function deployAgents() {
  // Global agents are flat (no experts/ subdirectory) per the documented ~/.copilot/agents
  // convention -- flatten both the top-level agents and the experts/ subdirectory into one folder.
  const srcDir = path.join(ROOT, '.github', 'agents');
  const destDir = path.join(COPILOT_HOME, 'agents');
  fs.mkdirSync(destDir, { recursive: true });
  const names = [];

  function copyAgentFilesFrom(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        copyAgentFilesFrom(path.join(dir, entry.name));
      } else if (entry.name.endsWith('.agent.md')) {
        copyFile(path.join(dir, entry.name), path.join(destDir, entry.name));
        names.push(entry.name);
      }
    }
  }
  copyAgentFilesFrom(srcDir);
  console.log(`agents      -> ${destDir}  (${names.length} agent files, flattened; confirmed global location for CLI, likely JetBrains via shared harness -- unconfirmed)`);
  return names;
}

function deployInstructions() {
  const src = path.join(ROOT, '.github', 'copilot-instructions.md');
  const dest = path.join(COPILOT_HOME, 'copilot-instructions.md');
  copyFile(src, dest);
  console.log(`instructions -> ${dest}  (confirmed global location for CLI; VS Code/JetBrains global instructions are settings-based, not a drop-in file -- verify by hand)`);
  return dest;
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
  if (fs.existsSync(path.join(srcDir, 'bin'))) {
    copyDir(path.join(srcDir, 'bin'), path.join(destDir, 'bin'));
  }
  console.log(`memory server code -> ${destDir}  (package.json + src/ + bin/ only; no test/, no node_modules/ copied)`);

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

// DESIGN.md §11b/§11f -- hooks were never deployed at all before this (confirmed by grepping this
// file: no "hooks" reference existed). Repo-level .github/hooks/*.json only ever applies inside
// this dev repo; the user-level location (COPILOT_HOME/hooks/, per GitHub's hooks docs) is what
// makes a hook apply globally, across every project -- same reasoning as skills/agents/instructions
// already deployed above. Same resolve-at-deploy-time idiom deployMcpConfigs() and deployTools()
// already use for paths that can't be known until the memory server is actually installed
// somewhere: {{MEMORY_HOOK_SCRIPT_PATH}} in the authored hook source gets substituted with the
// real installed path. A no-op string replace for any hook file that doesn't contain it.
function deployHooks(globalMemoryServerDir) {
  const srcDir = path.join(ROOT, '.github', 'hooks');
  const destDir = path.join(COPILOT_HOME, 'hooks');
  const names = [];
  if (!fs.existsSync(srcDir)) {
    console.log(`hooks       -> ${destDir}  (0 hooks, no .github/hooks source directory)`);
    return names;
  }
  const memoryHookScriptPath = path.join(globalMemoryServerDir, 'bin', 'memory-hook.js').replace(/\\/g, '/');
  const memoryCheckpointHookScriptPath = path.join(globalMemoryServerDir, 'bin', 'memory-checkpoint-hook.js').replace(/\\/g, '/');
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const content = fs
      .readFileSync(path.join(srcDir, entry.name), 'utf8')
      .split('{{MEMORY_HOOK_SCRIPT_PATH}}')
      .join(memoryHookScriptPath)
      .split('{{MEMORY_CHECKPOINT_HOOK_SCRIPT_PATH}}')
      .join(memoryCheckpointHookScriptPath);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, entry.name), content);
    names.push(entry.name);
  }
  console.log(`hooks       -> ${destDir}  (${names.length} hook files; user-level location per GitHub's hooks docs -- applies across every repo, not just this one)`);
  return names;
}

// UNINSTALL-DESIGN.md §4 -- these three files are shared, mixed-ownership locations. Deploy used
// to overwrite them wholesale; that silently destroyed any pre-existing or independently-added
// server entries the moment this plugin was installed, which is exactly the thing the uninstall
// design is trying to avoid on the way *out*. Fixed here too: merge our five known keys into
// whatever's already there instead of replacing the whole object, and record a "_managedBy"
// sibling key listing exactly which keys are ours -- self-contained ownership tracking that
// survives even if the external manifest is lost (UNINSTALL-DESIGN.md §4's MCP-configs bullet).
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEqual(a[k], b[k]));
}

// isFirstDeploy: found and fixed during real-CLI testing -- without this check, a reserved key
// (e.g. "context7") that a user already had configured with their OWN different command/args
// BEFORE ever installing this plugin gets silently overwritten on first deploy, with nothing
// recording what it used to be. Uninstall can't recover it afterward either: by the time uninstall
// runs, the live value matches exactly what deploy wrote, so there's no drift to detect -- the
// original is just gone. Mirrors patch-vscode-settings.js's own "always back up before touching
// anything shared" rule: on a first deploy only, a reserved key that already holds different
// content gets preserved under "_preSupercopilotBackup" before being overwritten, instead of
// silently discarded. Not applied on subsequent deploys (manifest already present) -- that's just
// this plugin refreshing its own previously-deployed config, not a collision with someone else's.
function mergeManagedServers(configPath, serversKey, resolvedServers, isFirstDeploy) {
  let existing = {};
  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      console.warn(`  WARNING: ${configPath} exists but isn't valid JSON -- replacing it rather than merging (${err.message})`);
      existing = {};
    }
  }
  existing[serversKey] = existing[serversKey] || {};
  const managedKeys = Object.keys(resolvedServers);
  for (const key of managedKeys) {
    const current = existing[serversKey][key];
    if (isFirstDeploy && current !== undefined && !deepEqual(current, resolvedServers[key])) {
      existing._preSupercopilotBackup = existing._preSupercopilotBackup || {};
      existing._preSupercopilotBackup[key] = current;
      console.warn(
        `  WARNING: ${configPath} already had a differently-configured "${key}" server before this install -- ` +
          `its original value was preserved under _preSupercopilotBackup.${key} rather than discarded. Restore it by hand if you need it back.`
      );
    }
    existing[serversKey][key] = resolvedServers[key];
  }
  existing._managedBy = existing._managedBy || {};
  existing._managedBy.supercopilot = managedKeys;

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n');
  return { path: configPath, serverKeys: managedKeys, entries: resolvedServers };
}

function deployMcpConfigs(globalMemoryServerDir, isFirstDeploy) {
  const { servers } = JSON.parse(fs.readFileSync(path.join(ROOT, 'sources', 'mcp-servers.json'), 'utf8'));

  // Global configs need absolute paths, not ${workspaceFolder} -- resolve every server's path,
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

  const result = { cli: null, vscode: null, jetbrains: null };

  // Copilot CLI -- confirmed global location.
  const cliConfigPath = path.join(COPILOT_HOME, 'mcp-config.json');
  result.cli = mergeManagedServers(cliConfigPath, 'mcpServers', resolvedServers, isFirstDeploy);
  console.log(`mcp (CLI)   -> ${cliConfigPath}  (confirmed; merged with any pre-existing entries)`);

  // VS Code -- global mcp.json lives in the VS Code user-data folder, which varies by platform
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
    result.vscode = mergeManagedServers(vsCodeConfigPath, 'servers', resolvedServers, isFirstDeploy);
    console.log(`mcp (VS Code) -> ${vsCodeConfigPath}  (found and written; merged with any pre-existing entries)`);
  } else {
    console.log(
      `mcp (VS Code) -> NOT WRITTEN. No VS Code user-data folder found on this machine (checked: ${vsCodeUserDirs.join(', ')}). ` +
        `On the real target machine, open VS Code and run "MCP: Add Server" -> Global from the Command Palette to create the file, ` +
        `then paste in this JSON: ${JSON.stringify({ servers: resolvedServers })}`
    );
  }

  // JetBrains -- global path is documented as ~/.config/github-copilot/intellij/mcp.json,
  // consistent across platforms in what's documented (not OS-conditional the way VS Code's is).
  const jetbrainsConfigPath = path.join(HOME, '.config', 'github-copilot', 'intellij', 'mcp.json');
  result.jetbrains = mergeManagedServers(jetbrainsConfigPath, 'servers', resolvedServers, isFirstDeploy);
  console.log(`mcp (JetBrains) -> ${jetbrainsConfigPath}  (written per documentation; merged with any pre-existing entries; not yet hands-on confirmed in a real IDE, see TESTING.md)`);

  return result;
}

function patchVsCodeAgentLocations() {
  const agentsPath = path.join(COPILOT_HOME, 'agents').replace(/\\/g, '/');
  console.log('');
  execFileSync('node', [path.join(__dirname, 'patch-vscode-settings.js'), agentsPath], { stdio: 'inherit' });
  return agentsPath;
}

// UNINSTALL-DESIGN.md §3 -- rather than changing the IPC contract with patch-vscode-settings.js
// (a standalone script, invoked as a subprocess), just re-read whatever it left behind. This
// independently confirms what actually happened (markers present, key present, or neither) using
// the same detection either uninstall or a future re-deploy would use anyway.
function detectVsCodeSettingsPatch(agentsPath) {
  const vsCodeUserDirs = [
    path.join(HOME, 'AppData', 'Roaming', 'Code', 'User'),
    path.join(HOME, 'AppData', 'Roaming', 'Code - Insiders', 'User'),
    path.join(HOME, '.config', 'Code', 'User'),
    path.join(HOME, 'Library', 'Application Support', 'Code', 'User'),
  ];
  const foundVsCodeDir = vsCodeUserDirs.find((d) => fs.existsSync(d));
  if (!foundVsCodeDir) return null;
  const settingsPath = path.join(foundVsCodeDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) return null;
  const content = fs.readFileSync(settingsPath, 'utf8');
  if (!content.includes('"chat.agentFilesLocations"')) return null;
  return {
    path: settingsPath,
    key: 'chat.agentFilesLocations',
    value: { [agentsPath]: true },
    hasMarkers: content.includes('supercopilot managed'),
  };
}

function deployTools(requestedTools) {
  // Opt-in only -- no flags means no tools installed, unchanged from before this existed
  // (TOOLS-DESIGN.md §7).
  if (requestedTools.size === 0) return { deployed: [], envCreatedByUs: false };

  const srcRoot = path.join(ROOT, 'tools');
  const destRoot = path.join(COPILOT_HOME, 'tools');

  // Sibling to skills/agents/mcp-servers, not inside any of them -- installed separately from
  // the plugin itself (TOOLS-DESIGN.md §3). Shared package.json declares ESM for every script
  // under destRoot; Node resolves it by walking up from each script's own directory, so this one
  // file (no dependencies to install) covers jira/, confluence/, gitlab/, and lib/ alike.
  copyFile(path.join(srcRoot, 'package.json'), path.join(destRoot, 'package.json'));
  copyDir(path.join(srcRoot, 'lib'), path.join(destRoot, 'lib'));

  // Created from the template only if missing -- an existing .env (real credentials) is never
  // overwritten by a re-install (TOOLS-DESIGN.md §4/§7).
  const envDest = path.join(destRoot, '.env');
  let envCreatedByUs = false;
  if (!fs.existsSync(envDest)) {
    copyFile(path.join(srcRoot, '.env.example'), envDest);
    envCreatedByUs = true;
    console.log(`tools .env  -> ${envDest}  (created from template -- fill in real credentials before use)`);
  } else {
    console.log(`tools .env  -> ${envDest}  (already exists, left untouched)`);
  }

  for (const name of requestedTools) {
    const toolDestDir = path.join(destRoot, name);
    copyDir(path.join(srcRoot, name), toolDestDir, ['test']);

    // Stamp the resolved absolute script path into the already-deployed skill, same
    // resolve-at-deploy-time idiom deployMcpConfigs() already uses for ${workspaceFolder} and
    // the memory server's args (TOOLS-DESIGN.md §5) -- avoids relying on shell tilde-expansion,
    // which isn't portable across bash/zsh/PowerShell.
    const scriptPath = path.join(toolDestDir, TOOL_SCRIPT_FILENAMES[name]).replace(/\\/g, '/');
    const skillPath = path.join(COPILOT_HOME, 'skills', name, 'SKILL.md');
    if (fs.existsSync(skillPath)) {
      const patched = fs.readFileSync(skillPath, 'utf8').split(TOOL_SKILL_PLACEHOLDERS[name]).join(scriptPath);
      fs.writeFileSync(skillPath, patched);
      console.log(`tool: ${name} -> ${toolDestDir}  (skill patched with resolved script path)`);
    } else {
      console.log(
        `tool: ${name} -> ${toolDestDir}  (WARNING: ${skillPath} not found -- deploySkills() should have written it first)`
      );
    }
  }

  return { deployed: [...requestedTools], envCreatedByUs };
}

// UNINSTALL-DESIGN.md §7 -- the prerequisite for uninstall's primary (safest) removal path.
// Written last, after everything else has actually happened, so it reflects ground truth rather
// than intent. Deleted again by uninstall-global.js on a successful run (§8: "its only purpose is
// enabling uninstall").
function writeManifest(data) {
  const manifestPath = path.join(COPILOT_HOME, '.supercopilot-manifest.json');
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const manifest = {
    version: pkgVersion,
    deployedAt: new Date().toISOString(),
    skills: data.skills,
    agents: data.agents,
    instructionsFile: data.instructionsFile,
    memoryServerDir: data.memoryServerDir,
    hooksDeployed: data.hooksDeployed,
    mcpConfigs: data.mcpConfigs,
    vscodeSettingsPatched: data.vscodeSettingsPatched,
    toolsDeployed: data.toolsResult.deployed,
    toolsEnvCreatedByUs: data.toolsResult.envCreatedByUs,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`manifest    -> ${manifestPath}`);
}

// Validated first, before any deploy step -- an invalid --tool= value aborts the entire run.
const requestedTools = parseRequestedTools(process.argv.slice(2));

// Checked before anything runs, since deploySkills() etc. don't touch this file -- only
// writeManifest() does, at the very end. "First deploy" means no manifest yet, i.e. this plugin
// has never successfully deployed here before (fresh install, or a clean reinstall after uninstall).
const isFirstDeploy = !fs.existsSync(path.join(COPILOT_HOME, '.supercopilot-manifest.json'));

const skills = deploySkills();
const agents = deployAgents();
const instructionsFile = deployInstructions();
const globalMemoryServerDir = installMemoryServer();
const hooks = deployHooks(globalMemoryServerDir);
const mcpConfigs = deployMcpConfigs(globalMemoryServerDir, isFirstDeploy);
const agentsPathForSettings = patchVsCodeAgentLocations();
const vscodeSettingsPatched = detectVsCodeSettingsPatch(agentsPathForSettings);
const toolsResult = deployTools(requestedTools);

writeManifest({
  skills,
  agents,
  instructionsFile,
  memoryServerDir: globalMemoryServerDir,
  hooksDeployed: hooks,
  mcpConfigs,
  vscodeSettingsPatched,
  toolsResult,
});

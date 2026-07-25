#!/usr/bin/env node
// Reverts what "npm run deploy:global" writes, per UNINSTALL-DESIGN.md. Nothing is removed
// because it *looks like* something this plugin wrote -- it's removed because there's a specific,
// checkable reason to believe deploy put it there (UNINSTALL-DESIGN.md §2). Three tiers, tried in
// order: manifest (primary, exact), recompute-and-diff against current repo source (fallback, safe
// failure mode), name-only for skills/agents alone (last resort, --force-by-name, never for the
// three MCP config files or settings.json).
//
// Default run is a dry run: prints the plan, touches nothing. --yes actually executes it.

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const COPILOT_HOME = process.env.COPILOT_HOME || path.join(HOME, '.copilot');

const argv = process.argv.slice(2);
const FLAGS = {
  yes: argv.includes('--yes'),
  purgeMemoryData: argv.includes('--purge-memory-data'),
  purgeToolsEnv: argv.includes('--purge-tools-env'),
  forceByName: argv.includes('--force-by-name'),
};

// A small ledger of what happened, printed as the final report regardless of dry-run or real.
const report = { removed: [], skippedDrift: [], leftAlone: [] };

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEqual(a[k], b[k]));
}

function loadManifest() {
  const p = path.join(COPILOT_HOME, '.supercopilot-manifest.json');
  if (!fs.existsSync(p)) return null;
  try {
    return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
  } catch (err) {
    console.warn(`Manifest at ${p} exists but isn't valid JSON (${err.message}) -- falling back to recompute mode.`);
    return null;
  }
}

// UNINSTALL-DESIGN.md §2 tier 2 -- deploy output is deterministic from sources/ and .github/, so
// recompute what deploy *would* write today and compare against that instead of the manifest.
// Deliberately duplicated from deploy-global.js's own resolution logic rather than shared, same
// small-script-duplication style deploy-global.js itself already uses (copyFile/copyDir aren't
// shared with generate.js either). Keep in sync by hand if that logic changes.
function recomputeExpected() {
  const skills = [];
  const skillsSrcDir = path.join(ROOT, '.github', 'skills');
  if (fs.existsSync(skillsSrcDir)) {
    for (const name of fs.readdirSync(skillsSrcDir)) {
      const f = path.join(skillsSrcDir, name, 'SKILL.md');
      if (fs.existsSync(f)) skills.push({ name, content: fs.readFileSync(f, 'utf8') });
    }
  }

  const agents = [];
  const agentsSrcDir = path.join(ROOT, '.github', 'agents');
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else if (entry.name.endsWith('.agent.md')) {
        agents.push({ name: entry.name, content: fs.readFileSync(path.join(dir, entry.name), 'utf8') });
      }
    }
  }
  if (fs.existsSync(agentsSrcDir)) walk(agentsSrcDir);

  const instructionsSrc = path.join(ROOT, '.github', 'copilot-instructions.md');
  const instructionsContent = fs.existsSync(instructionsSrc) ? fs.readFileSync(instructionsSrc, 'utf8') : null;

  // DESIGN.md §11f -- mirrors deploy-global.js's own {{MEMORY_HOOK_SCRIPT_PATH}} substitution so
  // recomputed hook content matches what was actually deployed, the same way resolvedServers.memory
  // below mirrors deployMcpConfigs()'s path resolution.
  const hooks = [];
  const hooksSrcDir = path.join(ROOT, '.github', 'hooks');
  if (fs.existsSync(hooksSrcDir)) {
    const memoryHookScriptPath = path
      .join(COPILOT_HOME, 'mcp-servers', 'memory-mcp-server', 'bin', 'memory-hook.js')
      .replace(/\\/g, '/');
    for (const entry of fs.readdirSync(hooksSrcDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        const content = fs
          .readFileSync(path.join(hooksSrcDir, entry.name), 'utf8')
          .split('{{MEMORY_HOOK_SCRIPT_PATH}}')
          .join(memoryHookScriptPath);
        hooks.push({ name: entry.name, content });
      }
    }
  }

  let resolvedServers = {};
  const mcpSrc = path.join(ROOT, 'sources', 'mcp-servers.json');
  if (fs.existsSync(mcpSrc)) {
    const { servers } = JSON.parse(fs.readFileSync(mcpSrc, 'utf8'));
    for (const s of servers) {
      const args = s.args.map((a) => a.replace('${workspaceFolder}', ROOT.replace(/\\/g, '/')));
      resolvedServers[s.name] = { command: s.command, args, env: s.env };
    }
    if (resolvedServers.memory) {
      resolvedServers.memory.args = [
        path.join(COPILOT_HOME, 'mcp-servers', 'memory-mcp-server', 'src', 'index.js').replace(/\\/g, '/'),
      ];
    }
  }

  return { skills, agents, instructionsContent, resolvedServers, hooks };
}

// DESIGN.md §11f -- same tiered logic planSkillsAndAgents uses (manifest names first, recompute
// content as ground truth, orphan detection last), kept as its own small function rather than
// generalizing planOne's closure -- this file's own existing convention is small duplicated
// functions per artifact type, not a shared abstraction (see the comment on recomputeExpected).
function planHooks(manifest, recomputed) {
  const plan = [];
  const knownNames = new Set();
  const names = manifest ? manifest.data.hooksDeployed || [] : recomputed.hooks.map((h) => h.name);
  for (const name of names) {
    knownNames.add(name);
    const target = path.join(COPILOT_HOME, 'hooks', name);
    if (!fs.existsSync(target)) continue; // already gone, nothing to report
    const liveContent = fs.readFileSync(target, 'utf8');
    const expected = recomputed.hooks.find((h) => h.name === name);
    if (!expected) {
      plan.push({ name, target, action: 'skip-drift' }); // manifest lists it, current source doesn't
    } else if (liveContent === expected.content) {
      plan.push({ name, target, action: 'remove' });
    } else {
      plan.push({ name, target, action: 'skip-drift' });
    }
  }
  const hooksDir = path.join(COPILOT_HOME, 'hooks');
  if (fs.existsSync(hooksDir)) {
    for (const entry of fs.readdirSync(hooksDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json') && !knownNames.has(entry.name)) {
        plan.push({
          name: entry.name,
          target: path.join(hooksDir, entry.name),
          action: FLAGS.forceByName ? 'name-only' : 'skip-orphan',
        });
      }
    }
  }
  return plan;
}

function planSkillsAndAgents(manifest, recomputed) {
  const plan = { skills: [], agents: [] };
  const knownNames = { skills: new Set(), agents: new Set() };

  function planOne(kind, dirOrFileFn, names, contentFor) {
    for (const name of names) {
      knownNames[kind].add(name);
      const target = dirOrFileFn(name);
      if (!fs.existsSync(target)) continue; // already gone, nothing to report
      const liveContent = fs.readFileSync(target, 'utf8');
      const expected = contentFor(name);
      if (expected === undefined) {
        plan[kind].push({ name, target, action: 'skip-drift' }); // manifest lists it, but current source doesn't -- treat as drift, not a match
      } else if (liveContent === expected) {
        plan[kind].push({ name, target, action: 'remove' });
      } else {
        plan[kind].push({ name, target, action: 'skip-drift' });
      }
    }
  }

  if (manifest) {
    planOne(
      'skills',
      (name) => path.join(COPILOT_HOME, 'skills', name, 'SKILL.md'),
      manifest.data.skills || [],
      (name) => {
        const r = recomputed.skills.find((s) => s.name === name);
        return r ? r.content : undefined; // manifest doesn't store content itself; recompute is the content ground truth either way, manifest gives us the name list
      }
    );
    planOne(
      'agents',
      (name) => path.join(COPILOT_HOME, 'agents', name),
      manifest.data.agents || [],
      (name) => {
        const r = recomputed.agents.find((a) => a.name === name);
        return r ? r.content : undefined;
      }
    );
  } else {
    // No manifest at all -- recompute mode owns both the name list and the content.
    planOne('skills', (name) => path.join(COPILOT_HOME, 'skills', name, 'SKILL.md'), recomputed.skills.map((s) => s.name), (name) => recomputed.skills.find((s) => s.name === name).content);
    planOne('agents', (name) => path.join(COPILOT_HOME, 'agents', name), recomputed.agents.map((a) => a.name), (name) => recomputed.agents.find((a) => a.name === name).content);
  }

  // Tier 3 (UNINSTALL-DESIGN.md §2.3), narrowed to what's actually coherent: this script can only
  // run from inside a checked-out repo, so "the source repo is gone" (the scenario §2.3 was
  // originally framed around) can't happen while it's running -- that's a real, separate
  // bootstrapping gap (UNINSTALL-DESIGN.md §8), not something this flag can address. What *is*
  // real: a skill/agent directory on disk whose name doesn't exist in the currently-checked-out
  // source at all -- e.g. orphaned by a rename or removal between the version that was deployed
  // and the version now checked out. Neither manifest nor recompute can verify its content (there's
  // nothing to compare against), so it's only ever offered under --force-by-name, and only by name.
  function findOrphans(kind, dir, extractName) {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .map((e) => extractName(e))
      .filter((name) => name && !knownNames[kind].has(name));
  }
  const orphanSkills = findOrphans('skills', path.join(COPILOT_HOME, 'skills'), (e) => (e.isDirectory() ? e.name : null));
  const orphanAgents = findOrphans('agents', path.join(COPILOT_HOME, 'agents'), (e) => (e.isFile() && e.name.endsWith('.agent.md') ? e.name : null));

  for (const name of orphanSkills) {
    plan.skills.push({
      name,
      target: path.join(COPILOT_HOME, 'skills', name, 'SKILL.md'),
      action: FLAGS.forceByName ? 'name-only' : 'skip-orphan',
    });
  }
  for (const name of orphanAgents) {
    plan.agents.push({
      name,
      target: path.join(COPILOT_HOME, 'agents', name),
      action: FLAGS.forceByName ? 'name-only' : 'skip-orphan',
    });
  }

  return plan;
}

function planMcpConfig(surfaceName, configPath, manifestEntry, recomputedServers) {
  if (!configPath || !fs.existsSync(configPath)) return null;
  let json;
  try {
    json = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return { surfaceName, configPath, action: 'skip-unparseable', error: err.message };
  }

  const serversKey = json.mcpServers ? 'mcpServers' : 'servers';
  const managedKeys = json._managedBy && Array.isArray(json._managedBy.supercopilot) ? json._managedBy.supercopilot : null;

  // No self-contained ownership marker -- fall back to the manifest's recorded key list for this
  // exact surface, if we have one. If neither exists, we cannot safely determine which keys (if
  // any) are ours in a file that may hold entries from elsewhere -- skip the whole file rather
  // than guess by name (UNINSTALL-DESIGN.md §1: "context7"/"playwright" are plausible independent
  // entries).
  const keysToConsider = managedKeys || (manifestEntry ? manifestEntry.serverKeys : null);
  if (!keysToConsider) {
    return { surfaceName, configPath, action: 'skip-unowned', reason: 'no _managedBy marker and no manifest entry for this surface' };
  }

  const perKey = [];
  for (const key of keysToConsider) {
    const live = json[serversKey] && json[serversKey][key];
    if (live === undefined) continue; // already gone
    const expected = recomputedServers[key] || (manifestEntry && manifestEntry.entries && manifestEntry.entries[key]);
    if (expected && deepEqual(live, expected)) {
      perKey.push({ key, action: 'remove' });
    } else {
      perKey.push({ key, action: 'skip-drift' });
    }
  }

  return { surfaceName, configPath, json, serversKey, perKey };
}

function planSettingsJson() {
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

  const markerRe = /,?[ \t]*\r?\n?[ \t]*\/\/ >>> supercopilot managed >>>[\s\S]*?\/\/ <<< supercopilot managed <<</;
  if (markerRe.test(content)) {
    return { settingsPath, content, mode: 'markers', re: markerRe };
  }

  // No markers -- this install predates them. Fall back to the original exact-value check: only
  // remove chat.agentFilesLocations if its value is a single entry pointing at our own agents dir.
  const agentsPath = path.join(COPILOT_HOME, 'agents').replace(/\\/g, '/');
  const exactRe = new RegExp(
    `,?[ \\t]*\\r?\\n?[ \\t]*"chat\\.agentFilesLocations"\\s*:\\s*\\{\\s*"${agentsPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s*:\\s*true\\s*\\}`
  );
  if (exactRe.test(content)) {
    return { settingsPath, content, mode: 'exact-match', re: exactRe };
  }

  if (content.includes('"chat.agentFilesLocations"')) {
    return { settingsPath, content, mode: 'skip-drift' };
  }
  return null;
}

function stripJsonComments(text) {
  // Mirrors patch-vscode-settings.js's own helper -- used only for the post-removal validity
  // check, never for the actual output written to disk.
  let result = '';
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (c === '\n') { inLineComment = false; result += c; }
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') { inBlockComment = false; i++; }
      continue;
    }
    if (inString) {
      result += c;
      if (c === '\\') { result += next; i++; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; result += c; continue; }
    if (c === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && next === '*') { inBlockComment = true; i++; continue; }
    result += c;
  }
  return result.replace(/,(\s*[}\]])/g, '$1');
}

function planMemoryServer() {
  const dir = path.join(COPILOT_HOME, 'mcp-servers', 'memory-mcp-server');
  return fs.existsSync(dir) ? dir : null;
}

function planMemoryData() {
  const dir = path.join(COPILOT_HOME, 'memory-data');
  return fs.existsSync(dir) ? dir : null;
}

function planTools(manifest) {
  const toolsRoot = path.join(COPILOT_HOME, 'tools');
  if (!fs.existsSync(toolsRoot)) return null;
  const deployed = manifest && manifest.data.toolsDeployed ? manifest.data.toolsDeployed : null;
  if (!deployed) {
    return { toolsRoot, deployed: null, reason: 'no manifest -- cannot confirm which tools (if any) this plugin deployed here' };
  }
  return { toolsRoot, deployed };
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function main() {
  const manifest = loadManifest();
  const recomputed = recomputeExpected();

  console.log(manifest ? `Using manifest: ${manifest.path}` : 'No manifest found -- using recompute-and-diff against the current repo checkout instead.');
  console.log('');

  const saPlan = planSkillsAndAgents(manifest, recomputed);
  const mcpPlan = {
    cli: planMcpConfig('cli', path.join(COPILOT_HOME, 'mcp-config.json'), manifest && manifest.data.mcpConfigs && manifest.data.mcpConfigs.cli, recomputed.resolvedServers),
    vscode: (() => {
      const vsCodeUserDirs = [
        path.join(HOME, 'AppData', 'Roaming', 'Code', 'User'),
        path.join(HOME, 'AppData', 'Roaming', 'Code - Insiders', 'User'),
        path.join(HOME, '.config', 'Code', 'User'),
        path.join(HOME, 'Library', 'Application Support', 'Code', 'User'),
      ];
      const dir = vsCodeUserDirs.find((d) => fs.existsSync(d));
      return dir ? planMcpConfig('vscode', path.join(dir, 'mcp.json'), manifest && manifest.data.mcpConfigs && manifest.data.mcpConfigs.vscode, recomputed.resolvedServers) : null;
    })(),
    jetbrains: planMcpConfig(
      'jetbrains',
      path.join(HOME, '.config', 'github-copilot', 'intellij', 'mcp.json'),
      manifest && manifest.data.mcpConfigs && manifest.data.mcpConfigs.jetbrains,
      recomputed.resolvedServers
    ),
  };
  const instructionsPath = path.join(COPILOT_HOME, 'copilot-instructions.md');
  const instructionsMatch = fs.existsSync(instructionsPath) && fs.readFileSync(instructionsPath, 'utf8') === recomputed.instructionsContent;
  const instructionsExists = fs.existsSync(instructionsPath);
  const hooksPlan = planHooks(manifest, recomputed);
  const settingsPlan = planSettingsJson();
  const memoryServerDir = planMemoryServer();
  const memoryDataDir = planMemoryData();
  const toolsPlan = planTools(manifest);

  // ---- Print the plan ----
  console.log('Plan:');
  for (const name of saPlan.skills.filter((s) => s.action === 'remove').map((s) => s.name)) console.log(`  remove skill:  ${name}`);
  for (const s of saPlan.skills.filter((s) => s.action === 'skip-drift')) console.log(`  SKIP (drift):  skill ${s.name} -- content on disk doesn't match expected`);
  for (const s of saPlan.skills.filter((s) => s.action === 'skip-orphan')) console.log(`  SKIP (orphan): skill ${s.name} -- not in current source, can't verify -- pass --force-by-name to remove by name alone`);
  for (const s of saPlan.skills.filter((s) => s.action === 'name-only')) console.log(`  remove skill:  ${s.name}  (--force-by-name, unverified -- not in current source)`);
  for (const name of saPlan.agents.filter((a) => a.action === 'remove').map((a) => a.name)) console.log(`  remove agent:  ${name}`);
  for (const a of saPlan.agents.filter((a) => a.action === 'skip-drift')) console.log(`  SKIP (drift):  agent ${a.name} -- content on disk doesn't match expected`);
  for (const a of saPlan.agents.filter((a) => a.action === 'skip-orphan')) console.log(`  SKIP (orphan): agent ${a.name} -- not in current source, can't verify -- pass --force-by-name to remove by name alone`);
  for (const a of saPlan.agents.filter((a) => a.action === 'name-only')) console.log(`  remove agent:  ${a.name}  (--force-by-name, unverified -- not in current source)`);

  if (instructionsExists) {
    console.log(instructionsMatch ? `  remove instructions: ${instructionsPath}` : `  SKIP (drift):  ${instructionsPath} -- content doesn't match deployed source`);
  }

  for (const [surface, plan] of Object.entries(mcpPlan)) {
    if (!plan) continue;
    if (plan.action === 'skip-unowned' || plan.action === 'skip-unparseable') {
      console.log(`  SKIP (${surface}): ${plan.configPath} -- ${plan.reason || plan.error}`);
      continue;
    }
    for (const pk of plan.perKey) {
      console.log(pk.action === 'remove' ? `  remove ${surface} MCP entry: ${pk.key}` : `  SKIP (drift):  ${surface} MCP entry ${pk.key} -- modified since deploy`);
    }
  }

  for (const name of hooksPlan.filter((h) => h.action === 'remove').map((h) => h.name)) console.log(`  remove hook:   ${name}`);
  for (const h of hooksPlan.filter((h) => h.action === 'skip-drift')) console.log(`  SKIP (drift):  hook ${h.name} -- content on disk doesn't match expected`);
  for (const h of hooksPlan.filter((h) => h.action === 'skip-orphan')) console.log(`  SKIP (orphan): hook ${h.name} -- not in current source, can't verify -- pass --force-by-name to remove by name alone`);
  for (const h of hooksPlan.filter((h) => h.action === 'name-only')) console.log(`  remove hook:   ${h.name}  (--force-by-name, unverified -- not in current source)`);

  if (settingsPlan) {
    console.log(
      settingsPlan.mode === 'skip-drift'
        ? `  SKIP (drift):  ${settingsPlan.settingsPath} chat.agentFilesLocations -- doesn't match expected single-entry value`
        : `  remove chat.agentFilesLocations from ${settingsPlan.settingsPath} (${settingsPlan.mode})`
    );
  }

  if (memoryServerDir) console.log(`  remove memory server code: ${memoryServerDir}`);
  if (memoryDataDir) console.log(`  LEAVE ALONE:   ${memoryDataDir}${FLAGS.purgeMemoryData ? ' (--purge-memory-data passed -- WILL remove)' : ' (pass --purge-memory-data to remove)'}`);
  if (toolsPlan) {
    if (toolsPlan.deployed) {
      console.log(`  remove tools:  ${toolsPlan.deployed.join(', ')} (package.json, lib/, per-tool dirs -- .env left alone unless --purge-tools-env)`);
    } else {
      console.log(`  SKIP (tools):  ${toolsPlan.toolsRoot} -- ${toolsPlan.reason}`);
    }
  }

  console.log('');
  if (!FLAGS.yes) {
    console.log('Dry run only -- nothing was touched. Re-run with --yes to actually execute this plan.');
    return;
  }

  // ---- Execute ----
  for (const s of saPlan.skills.filter((s) => s.action === 'remove' || s.action === 'name-only')) {
    rmrf(path.dirname(s.target));
    report.removed.push(s.action === 'name-only' ? `skill: ${s.name} (--force-by-name, unverified)` : `skill: ${s.name}`);
  }
  for (const a of saPlan.agents.filter((a) => a.action === 'remove' || a.action === 'name-only')) {
    fs.rmSync(a.target, { force: true });
    report.removed.push(a.action === 'name-only' ? `agent: ${a.name} (--force-by-name, unverified)` : `agent: ${a.name}`);
  }
  for (const s of saPlan.skills.filter((s) => s.action === 'skip-drift')) report.skippedDrift.push(`skill: ${s.name}`);
  for (const a of saPlan.agents.filter((a) => a.action === 'skip-drift')) report.skippedDrift.push(`agent: ${a.name}`);
  for (const s of saPlan.skills.filter((s) => s.action === 'skip-orphan')) report.leftAlone.push(`skill: ${s.name} (unrecognized, not in current source -- pass --force-by-name to remove)`);
  for (const a of saPlan.agents.filter((a) => a.action === 'skip-orphan')) report.leftAlone.push(`agent: ${a.name} (unrecognized, not in current source -- pass --force-by-name to remove)`);

  if (instructionsExists) {
    if (instructionsMatch) {
      fs.rmSync(instructionsPath, { force: true });
      report.removed.push('copilot-instructions.md');
    } else {
      report.skippedDrift.push('copilot-instructions.md');
    }
  }

  for (const h of hooksPlan.filter((h) => h.action === 'remove' || h.action === 'name-only')) {
    fs.rmSync(h.target, { force: true });
    report.removed.push(h.action === 'name-only' ? `hook: ${h.name} (--force-by-name, unverified)` : `hook: ${h.name}`);
  }
  for (const h of hooksPlan.filter((h) => h.action === 'skip-drift')) report.skippedDrift.push(`hook: ${h.name}`);
  for (const h of hooksPlan.filter((h) => h.action === 'skip-orphan')) report.leftAlone.push(`hook: ${h.name} (unrecognized, not in current source -- pass --force-by-name to remove)`);

  for (const [surface, plan] of Object.entries(mcpPlan)) {
    if (!plan || plan.action === 'skip-unowned' || plan.action === 'skip-unparseable') continue;
    for (const pk of plan.perKey) {
      if (pk.action === 'remove') {
        delete plan.json[plan.serversKey][pk.key];
        report.removed.push(`${surface} MCP entry: ${pk.key}`);
      } else {
        report.skippedDrift.push(`${surface} MCP entry: ${pk.key}`);
      }
    }
    if (plan.json._managedBy) {
      plan.json._managedBy.supercopilot = (plan.json._managedBy.supercopilot || []).filter(
        (k) => !plan.perKey.some((pk) => pk.key === k && pk.action === 'remove')
      );
      if (plan.json._managedBy.supercopilot.length === 0) delete plan.json._managedBy.supercopilot;
      if (Object.keys(plan.json._managedBy).length === 0) delete plan.json._managedBy;
    }
    const serverCount = Object.keys(plan.json[plan.serversKey] || {}).length;
    const otherTopLevelKeys = Object.keys(plan.json).filter((k) => k !== plan.serversKey);
    if (serverCount === 0 && otherTopLevelKeys.length === 0) {
      fs.rmSync(plan.configPath, { force: true });
      report.removed.push(`${surface} config file (now empty): ${plan.configPath}`);
    } else {
      fs.writeFileSync(plan.configPath, JSON.stringify(plan.json, null, 2) + '\n');
    }
  }

  if (settingsPlan && settingsPlan.mode !== 'skip-drift') {
    const patched = settingsPlan.content.replace(settingsPlan.re, '');
    try {
      JSON.parse(stripJsonComments(patched));
    } catch (err) {
      console.error(`Refusing to write ${settingsPlan.settingsPath} -- result failed a JSON validity check (${err.message}). Left untouched.`);
      report.skippedDrift.push('settings.json chat.agentFilesLocations (validity check failed)');
    }
    if (!report.skippedDrift.includes('settings.json chat.agentFilesLocations (validity check failed)')) {
      fs.writeFileSync(settingsPlan.settingsPath, patched, 'utf8');
      report.removed.push(`chat.agentFilesLocations (${settingsPlan.settingsPath})`);
    }
  } else if (settingsPlan) {
    report.skippedDrift.push(`chat.agentFilesLocations (${settingsPlan.settingsPath})`);
  }

  if (memoryServerDir) {
    rmrf(memoryServerDir);
    report.removed.push(`memory server code: ${memoryServerDir}`);
  }
  if (memoryDataDir) {
    if (FLAGS.purgeMemoryData) {
      rmrf(memoryDataDir);
      report.removed.push(`memory-data (--purge-memory-data): ${memoryDataDir}`);
    } else {
      report.leftAlone.push(`memory-data (pass --purge-memory-data to remove): ${memoryDataDir}`);
    }
  }

  if (toolsPlan && toolsPlan.deployed) {
    fs.rmSync(path.join(toolsPlan.toolsRoot, 'package.json'), { force: true });
    rmrf(path.join(toolsPlan.toolsRoot, 'lib'));
    for (const name of toolsPlan.deployed) rmrf(path.join(toolsPlan.toolsRoot, name));
    report.removed.push(`tools: ${toolsPlan.deployed.join(', ')}`);
    const envPath = path.join(toolsPlan.toolsRoot, '.env');
    if (fs.existsSync(envPath)) {
      if (FLAGS.purgeToolsEnv) {
        fs.rmSync(envPath, { force: true });
        report.removed.push(`tools .env (--purge-tools-env): ${envPath}`);
      } else {
        report.leftAlone.push(`tools .env (pass --purge-tools-env to remove -- holds real credentials): ${envPath}`);
      }
    }
    // Clean up the now-empty tools/ directory if .env is also gone.
    if (fs.existsSync(toolsPlan.toolsRoot) && fs.readdirSync(toolsPlan.toolsRoot).length === 0) {
      fs.rmdirSync(toolsPlan.toolsRoot);
    }
  }

  if (manifest) {
    fs.rmSync(manifest.path, { force: true });
    report.removed.push(`manifest: ${manifest.path}`);
  }

  console.log('');
  console.log(`Removed (${report.removed.length}):`);
  report.removed.forEach((r) => console.log(`  - ${r}`));
  console.log(`Skipped, drifted since deploy (${report.skippedDrift.length}):`);
  report.skippedDrift.forEach((r) => console.log(`  - ${r}`));
  console.log(`Left alone by design (${report.leftAlone.length}):`);
  report.leftAlone.forEach((r) => console.log(`  - ${r}`));
}

main();

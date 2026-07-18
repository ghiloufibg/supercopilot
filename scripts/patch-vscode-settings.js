#!/usr/bin/env node
// Safely adds "chat.agentFilesLocations" to VS Code's user settings.json without disturbing
// anything else in the file. settings.json is JSONC (comments + trailing commas allowed, per
// VS Code's own docs) -- a plain JSON.parse()-mutate-JSON.stringify() round-trip would silently
// strip every comment and reformat the whole file. Instead this does a surgical text insertion:
// find the final closing brace and splice the new property in just before it, leaving every
// other byte in the file untouched.
//
// Safety measures, in order:
//   1. Back up the original file first (settings.json.bak-<timestamp>), always, even if nothing
//      else goes wrong.
//   2. If the key already exists, do nothing automatically -- merging into an existing object
//      value safely would need real parsing (which is exactly what we're avoiding), so this
//      prints instructions instead of guessing.
//   3. After inserting, run a comment-stripped JSON.parse() as a sanity check on the RESULT
//      before writing it to disk. If that check fails, abort and leave the original file alone.

const fs = require('fs');
const path = require('path');
const os = require('os');

function stripJsonComments(text) {
  // Crude but sufficient for a validity *check* only (never used to produce the actual output
  // written to disk -- the real output is the original text with a surgical insertion, comments
  // and all, untouched). Handles // and /* */ outside of string literals.
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
  return result.replace(/,(\s*[}\]])/g, '$1'); // trailing commas
}

function findVsCodeUserDir() {
  // Override for testing (see test/patch-vscode-settings.manual-test.js) -- never needed in
  // real use, deploy-global.js never sets this.
  if (process.env.VSCODE_USER_DIR_OVERRIDE) return process.env.VSCODE_USER_DIR_OVERRIDE;
  const HOME = os.homedir();
  const candidates = [
    path.join(HOME, 'AppData', 'Roaming', 'Code', 'User'),
    path.join(HOME, 'AppData', 'Roaming', 'Code - Insiders', 'User'),
    path.join(HOME, '.config', 'Code', 'User'),
    path.join(HOME, 'Library', 'Application Support', 'Code', 'User'),
  ];
  return candidates.find((d) => fs.existsSync(d));
}

function patch(agentsPath) {
  const userDir = findVsCodeUserDir();
  if (!userDir) {
    console.log('No VS Code user-data folder found on this machine -- nothing to patch here. Run this on the actual target machine instead.');
    return;
  }

  const settingsPath = path.join(userDir, 'settings.json');
  const KEY = '"chat.agentFilesLocations"';

  if (!fs.existsSync(settingsPath)) {
    // No existing settings file at all -- safe to just create a minimal one, no merge needed.
    const fresh = `{\n  "chat.agentFilesLocations": {\n    "${agentsPath}": true\n  }\n}\n`;
    fs.writeFileSync(settingsPath, fresh, 'utf8');
    console.log(`No existing settings.json found -- created a new one at ${settingsPath}`);
    return;
  }

  const original = fs.readFileSync(settingsPath, 'utf8');

  if (original.includes(KEY)) {
    console.log(
      `${settingsPath} already has a "chat.agentFilesLocations" entry -- not touching it automatically ` +
        `(merging into an existing object safely needs real JSON parsing, which is exactly what this script avoids). ` +
        `Add this path to it by hand instead: "${agentsPath}": true`
    );
    return;
  }

  // Back up before doing anything else, unconditionally.
  const backupPath = `${settingsPath}.bak-${Date.now()}`;
  fs.copyFileSync(settingsPath, backupPath);

  // Find the last closing brace of the root object -- for a well-formed settings.json, that's
  // the last non-whitespace character in the file.
  const trimmedEnd = original.replace(/\s+$/, '');
  if (!trimmedEnd.endsWith('}')) {
    console.error(
      `${settingsPath} doesn't end with "}" as expected -- refusing to guess where to insert. ` +
        `Backup was made at ${backupPath} (harmless, nothing was changed). Add this by hand: ${KEY}: { "${agentsPath}": true }`
    );
    return;
  }
  const insertionPoint = trimmedEnd.length - 1; // index of the final "}"

  // Insert right after the last real (non-whitespace) character before the closing brace, not
  // right before it -- otherwise a comma ends up alone on its own line. Preserve whatever
  // whitespace was already there between the last property and "}".
  const beforeClose = original.slice(0, insertionPoint);
  const trailingWs = beforeClose.match(/\s*$/)[0];
  const contentBeforeWs = beforeClose.slice(0, beforeClose.length - trailingWs.length);

  // Does the object already have at least one real (non-comment) property? If so, our new
  // property needs a leading comma -- UNLESS the file already ends with a trailing comma
  // (valid JSONC, which VS Code allows), in which case adding another would double it up.
  const bodyStripped = stripJsonComments(contentBeforeWs).trim();
  const objectOpensAt = bodyStripped.indexOf('{');
  const hasExistingProperties = bodyStripped.slice(objectOpensAt + 1).trim().length > 0;
  const alreadyEndsWithComma = contentBeforeWs.endsWith(',');
  const needsComma = hasExistingProperties && !alreadyEndsWithComma;

  const newProperty = `${needsComma ? ',' : ''}\n  ${KEY}: {\n    "${agentsPath}": true\n  }`;
  // Guarantee a newline before the closing brace even if the original had none (e.g. a bare "{}").
  const separator = trailingWs.includes('\n') ? trailingWs : `\n${trailingWs}`;
  const patched = contentBeforeWs + newProperty + separator + original.slice(insertionPoint);

  // Sanity check the RESULT before writing anything -- if this doesn't parse as valid
  // (comment-stripped) JSON, abort. The file on disk is still untouched at this point.
  try {
    JSON.parse(stripJsonComments(patched));
  } catch (err) {
    console.error(
      `Patched result failed a JSON validity check (${err.message}) -- aborting without writing anything. ` +
        `Original file is untouched. Backup (unused) is at ${backupPath} -- safe to delete. ` +
        `Add this by hand instead: ${KEY}: { "${agentsPath}": true }`
    );
    return;
  }

  fs.writeFileSync(settingsPath, patched, 'utf8');
  console.log(`Patched ${settingsPath} -- added chat.agentFilesLocations. Backup of the original saved at ${backupPath}.`);
}

const agentsPath = process.argv[2];
if (!agentsPath) {
  console.error('Usage: node scripts/patch-vscode-settings.js <absolute-path-to-copilot-agents-folder>');
  process.exit(1);
}
patch(agentsPath.replace(/\\/g, '/'));

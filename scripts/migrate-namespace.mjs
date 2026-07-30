#!/usr/bin/env node
/**
 * One-time vault migration for the Ink Custom namespace split.
 *
 * Ink Custom used to share its view types, file extensions and codeblock languages
 * with upstream Ink, which are all app-wide registries in Obsidian. Whichever plugin
 * loaded second failed to register and aborted partway through onload, so the two
 * could never be enabled together. This script moves existing vault content onto the
 * fork's own names so both plugins can coexist.
 *
 *   .writing        ->  .inkcwriting
 *   .drawing        ->  .inkcdrawing
 *   .notebook       ->  .inkcnotebook
 *   ```handwritten-ink  ->  ```handwritten-inkc
 *   ```handdrawn-ink    ->  ```handdrawn-inkc
 *   ```notebook-ink     ->  ```notebook-inkc
 *
 * Keep the tables below in sync with src/constants.ts.
 *
 * Usage:
 *   node scripts/migrate-namespace.mjs --vault <path>            # dry run, prints a report
 *   node scripts/migrate-namespace.mjs --vault <path> --apply     # writes changes
 *
 * Disable BOTH Ink and Ink Custom in Obsidian before running with --apply, so no
 * rename hooks or editor autosaves race with the migration.
 *
 * Safe to re-run: every rewrite is anchored so already-migrated content is skipped.
 */

import fs from 'node:fs';
import path from 'node:path';

const EXT_MAP = {
	writing: 'inkcwriting',
	drawing: 'inkcdrawing',
	notebook: 'inkcnotebook',
};

const FENCE_MAP = {
	'handwritten-ink': 'handwritten-inkc',
	'handdrawn-ink': 'handdrawn-inkc',
	'notebook-ink': 'notebook-inkc',
};

const LEGACY_EXTS = Object.keys(EXT_MAP);
const SKIP_DIRS = new Set(['.obsidian', '.trash', '.git', 'node_modules']);

///////

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const vaultArg = args[args.indexOf('--vault') + 1];

if (!args.includes('--vault') || !vaultArg || vaultArg.startsWith('--')) {
	console.error('Usage: node scripts/migrate-namespace.mjs --vault <path> [--apply]');
	process.exit(1);
}

const vault = path.resolve(vaultArg);
if (!fs.existsSync(path.join(vault, '.obsidian'))) {
	console.error(`Not an Obsidian vault (no .obsidian folder): ${vault}`);
	process.exit(1);
}

///////

/** Recursively collects file paths, skipping plugin/system folders. */
function walk(dir, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			walk(path.join(dir, entry.name), out);
		} else if (entry.isFile()) {
			out.push(path.join(dir, entry.name));
		}
	}
	return out;
}

function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const allFiles = walk(vault);
const rel = (p) => path.relative(vault, p);

// 1. Ink files to rename
///////

const renames = [];
for (const file of allFiles) {
	const ext = path.extname(file).slice(1);
	if (!LEGACY_EXTS.includes(ext)) continue;
	const newPath = file.slice(0, -(ext.length)) + EXT_MAP[ext];
	renames.push({ from: file, to: newPath });
}

// Maps old filename (with extension) -> new filename, for wikilink rewriting.
const nameMap = new Map(
	renames.map(({ from, to }) => [path.basename(from), path.basename(to)])
);

const collisions = renames.filter(({ to }) => fs.existsSync(to));

// 2. Markdown rewrites
///////

const inkFenceRe = new RegExp(
	'^```(' + Object.keys(FENCE_MAP).map(escapeRegex).join('|') + ')[ \\t\\r]*$\\r?\\n([\\s\\S]*?)^```[ \\t\\r]*$',
	'gm'
);
const legacyExtInLinkRe = new RegExp('\\.(' + LEGACY_EXTS.join('|') + ')(?=\\]\\]|\\||")', 'g');

/** Rewrites the fence language and the legacy extensions inside ink embed JSON. */
function rewriteInkFences(content, stats) {
	return content.replace(inkFenceRe, (match, lang, body) => {
		stats.fences++;
		const newBody = body.replace(legacyExtInLinkRe, (m, ext) => {
			stats.embedRefs++;
			return '.' + EXT_MAP[ext];
		});
		// Record every embed target so dangling ones can be reported.
		for (const m of body.matchAll(/\[\[([^\]|]+)\]\]|"filepath":\s*"([^"]+)"/g)) {
			stats.targets.push(m[1] ?? m[2]);
		}
		return '```' + FENCE_MAP[lang] + '\n' + newBody + '```';
	});
}

/** Rewrites plain wikilinks that point at files this migration renames. */
function rewriteWikilinks(content, stats) {
	let out = content;
	for (const [oldName, newName] of nameMap) {
		const re = new RegExp('\\[\\[' + escapeRegex(oldName) + '(?=\\]\\]|\\|)', 'g');
		out = out.replace(re, () => {
			stats.wikilinks++;
			return '[[' + newName;
		});
	}
	return out;
}

const mdFiles = allFiles.filter((f) => f.endsWith('.md'));
const edits = [];
const stats = { fences: 0, embedRefs: 0, wikilinks: 0, targets: [] };

for (const mdFile of mdFiles) {
	const original = fs.readFileSync(mdFile, 'utf8');
	const fileStats = { fences: 0, embedRefs: 0, wikilinks: 0, targets: [] };

	// Fences first: it rewrites extensions inside embed JSON, so the wikilink pass
	// that follows only has to handle links in ordinary note prose.
	let updated = rewriteInkFences(original, fileStats);
	updated = rewriteWikilinks(updated, fileStats);

	stats.fences += fileStats.fences;
	stats.embedRefs += fileStats.embedRefs;
	stats.wikilinks += fileStats.wikilinks;
	stats.targets.push(...fileStats.targets);

	if (updated !== original) {
		edits.push({ file: mdFile, content: updated, ...fileStats });
	}
}

// 3. Dangling embed targets — pre-existing breakage the migration can't fix
///////

const existingNames = new Set(allFiles.map((f) => path.basename(f)));
const dangling = [...new Set(stats.targets)].filter((target) => {
	const name = path.basename(target);
	return !existingNames.has(name);
});

// 4. Report
///////

console.log(`Vault: ${vault}`);
console.log(`Mode:  ${apply ? 'APPLY (writing changes)' : 'DRY RUN (no changes written)'}\n`);

console.log(`Ink files to rename: ${renames.length}`);
for (const { from, to } of renames) {
	console.log(`  ${rel(from)}\n    -> ${path.basename(to)}`);
}

console.log(`\nNotes to rewrite: ${edits.length}`);
for (const edit of edits) {
	const parts = [];
	if (edit.fences) parts.push(`${edit.fences} fence(s)`);
	if (edit.embedRefs) parts.push(`${edit.embedRefs} embed ref(s)`);
	if (edit.wikilinks) parts.push(`${edit.wikilinks} wikilink(s)`);
	console.log(`  ${rel(edit.file)} — ${parts.join(', ')}`);
}

if (dangling.length) {
	console.log(`\nWARNING: ${dangling.length} embed target(s) already point at files that don't exist.`);
	console.log(`These were broken before the migration and stay broken after it:`);
	for (const target of dangling) console.log(`  ${target}`);
}

if (collisions.length) {
	console.error(`\nABORT: ${collisions.length} rename target(s) already exist:`);
	for (const { to } of collisions) console.error(`  ${rel(to)}`);
	process.exit(1);
}

if (!apply) {
	console.log(`\nNothing written. Re-run with --apply to perform the migration.`);
	process.exit(0);
}

// 5. Apply
///////

for (const { from, to } of renames) {
	fs.renameSync(from, to);
}
for (const edit of edits) {
	fs.writeFileSync(edit.file, edit.content, 'utf8');
}

console.log(`\nDone. Renamed ${renames.length} file(s), rewrote ${edits.length} note(s).`);

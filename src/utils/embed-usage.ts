import { Editor, TFile } from "obsidian";
import InkPlugin from "src/main";
import {
	DRAW_EMBED_KEY,
	LEGACY_DRAW_EMBED_KEY,
	LEGACY_NOTEBOOK_EMBED_KEY,
	LEGACY_WRITE_EMBED_KEY,
	NOTEBOOK_EMBED_KEY,
	WRITE_EMBED_KEY,
} from "src/constants";
import { resolveInkFileFromEmbed } from "./embed";
import { warn } from "./log-to-console";

/////////
/////////

const ALL_EMBED_KEYS = [
	WRITE_EMBED_KEY,
	DRAW_EMBED_KEY,
	NOTEBOOK_EMBED_KEY,
	LEGACY_WRITE_EMBED_KEY,
	LEGACY_DRAW_EMBED_KEY,
	LEGACY_NOTEBOOK_EMBED_KEY,
];

export type InkEmbedBlock = {
	/** Character offset of the start of the opening fence. */
	start: number;
	/** Character offset just past the closing fence (and its trailing newline, if any). */
	end: number;
};

export type InkEmbedUsage = {
	noteFile: TFile;
	count: number;
};

/**
 * Finds every ink embed code block in a markdown string that points at `inkFile`.
 * Blocks are returned in document order.
 */
export function findInkEmbedBlocks(
	plugin: InkPlugin,
	content: string,
	notePath: string,
	inkFile: TFile,
): InkEmbedBlock[] {
	// Cheap pre-filter — the link and the legacy filepath both contain the basename.
	if (!content.includes(inkFile.basename)) return [];

	const blockRegex = new RegExp(
		`^[ \\t]*\`\`\`(?:${ALL_EMBED_KEYS.join('|')})[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n[ \\t]*\`\`\`[ \\t]*(?:\\r?\\n|$)`,
		'gm',
	);

	const blocks: InkEmbedBlock[] = [];
	let match: RegExpExecArray | null;

	while ((match = blockRegex.exec(content)) !== null) {
		let embedData: { link?: string; filepath?: string };
		try {
			embedData = JSON.parse(match[1]);
		} catch (err) {
			continue;	// Malformed embed — leave it alone rather than guessing at it.
		}

		const referencedFile = resolveInkFileFromEmbed(plugin, embedData, notePath);
		if (referencedFile?.path !== inkFile.path) continue;

		blocks.push({
			start: match.index,
			end: match.index + match[0].length,
		});
	}

	return blocks;
}

/**
 * Scans every markdown file in the vault for embeds of `inkFile`.
 * Uses cachedRead, so repeat scans in a session are cheap.
 */
export async function findInkEmbedUsages(plugin: InkPlugin, inkFile: TFile): Promise<InkEmbedUsage[]> {
	const usages: InkEmbedUsage[] = [];

	for (const noteFile of plugin.app.vault.getMarkdownFiles()) {
		let content: string;
		try {
			content = await plugin.app.vault.cachedRead(noteFile);
		} catch (err) {
			warn(`Couldn't read ${noteFile.path} while looking for ink embeds.`);
			continue;
		}

		const blocks = findInkEmbedBlocks(plugin, content, noteFile.path, inkFile);
		if (blocks.length) usages.push({ noteFile, count: blocks.length });
	}

	return usages;
}

/**
 * Removes every embed of `inkFile` from every markdown file in the vault.
 * The note currently open in the editor is edited through the editor so that
 * undo history and cursor position survive.
 * @returns The number of embeds removed.
 */
export async function removeAllInkEmbedsInVault(plugin: InkPlugin, inkFile: TFile): Promise<number> {
	const activeEditor = plugin.app.workspace.activeEditor;
	const activeEditorFile = activeEditor?.file ?? null;
	let removedCount = 0;

	for (const noteFile of plugin.app.vault.getMarkdownFiles()) {
		const isOpenInEditor = !!activeEditor?.editor && activeEditorFile?.path === noteFile.path;

		if (isOpenInEditor) {
			removedCount += removeInkEmbedsViaEditor(plugin, activeEditor!.editor!, noteFile.path, inkFile);
			continue;
		}

		await plugin.app.vault.process(noteFile, (content) => {
			const blocks = findInkEmbedBlocks(plugin, content, noteFile.path, inkFile);
			if (!blocks.length) return content;
			removedCount += blocks.length;
			return spliceOutBlocks(content, blocks);
		});
	}

	return removedCount;
}

/**
 * Removes every embed of `inkFile` from the document currently in `editor`.
 * @returns The number of embeds removed.
 */
function removeInkEmbedsViaEditor(plugin: InkPlugin, editor: Editor, notePath: string, inkFile: TFile): number {
	const blocks = findInkEmbedBlocks(plugin, editor.getValue(), notePath, inkFile);
	if (!blocks.length) return 0;

	// Back to front so earlier offsets stay valid as ranges are removed.
	for (const block of [...blocks].reverse()) {
		editor.replaceRange('', editor.offsetToPos(block.start), editor.offsetToPos(block.end));
	}

	// The page scroll can jump when content is removed. Put the cursor where the user expects it.
	editor.setCursor(editor.offsetToPos(blocks[0].start));

	return blocks.length;
}

function spliceOutBlocks(content: string, blocks: InkEmbedBlock[]): string {
	let result = '';
	let cursor = 0;
	for (const block of blocks) {
		result += content.slice(cursor, block.start);
		cursor = block.end;
	}
	result += content.slice(cursor);
	return result;
}

////////
//////// Copying an embed, and deciding on paste whether it points at the same ink file or a copy.
////////
//////// Pasting an embed is ambiguous in a way pasting text isn't: the codeblock is just a link, so
//////// a naive paste silently produces a second view of the same file. Sometimes that's exactly
//////// what's wanted (the same diagram in two places, framed differently); sometimes it very much
//////// isn't, and editing one silently rewrites the other. So the choice is asked for at paste.
////////

import { Editor, Notice, TFile } from "obsidian";
import InkPlugin from "src/main";
import { DRAW_EMBED_KEY, NOTEBOOK_EMBED_KEY, WRITE_EMBED_KEY } from "src/constants";
import { resolveInkFileFromEmbed, stringifyEmbedData } from "./embed";
import { duplicateDrawingFile, duplicateWritingFile } from "./rememberDrawingFile";
import { getNewTimestampedNotebookFilepath } from "./file-manipulation";
import { PasteEmbedModal } from "src/modals/paste-embed-modal/paste-embed-modal";

const EMBED_KEYS: string[] = [WRITE_EMBED_KEY, DRAW_EMBED_KEY, NOTEBOOK_EMBED_KEY];

type ParsedEmbed = {
	key: string,
	data: Record<string, any>,
	block: string,
};

////////

export function buildEmbedBlock(key: string, data: Record<string, unknown>): string {
	return '```' + key + '\n' + stringifyEmbedData(data as any) + '\n```';
}

export async function copyEmbedToClipboard(key: string, data: Record<string, unknown>) {
	const block = buildEmbedBlock(key, data);
	try {
		await navigator.clipboard.writeText(block);
		new Notice('Embed copied. Paste it anywhere in your vault.');
	} catch (e) {
		// Clipboard access can be refused (no user gesture, or a hardened webview). Failing loudly
		// beats a copy action that looks like it worked and didn't.
		new Notice("Couldn't access the clipboard to copy this embed.");
	}
}

/** Recognises a pasted ink embed. Returns undefined for anything else, including near-misses. */
function parseEmbedBlock(text: string): ParsedEmbed | undefined {
	const trimmed = text.trim();

	const match = trimmed.match(/^```([a-z-]+)\r?\n([\s\S]*?)\r?\n?```$/);
	if (!match) return undefined;

	const [, key, body] = match;
	if (!EMBED_KEYS.includes(key)) return undefined;

	try {
		const data = JSON.parse(body);
		// A codeblock with our language but no link isn't something we can duplicate or rewrite.
		if (!data || typeof data !== 'object') return undefined;
		if (!data.link && !data.filepath) return undefined;
		return { key, data, block: trimmed };
	} catch {
		return undefined;
	}
}

async function duplicateForKey(plugin: InkPlugin, key: string, file: TFile, instigatingFile: TFile | null): Promise<TFile | null> {
	if (key === DRAW_EMBED_KEY) return duplicateDrawingFile(plugin, file, instigatingFile);
	if (key === WRITE_EMBED_KEY) return duplicateWritingFile(plugin, file, instigatingFile);

	if (key === NOTEBOOK_EMBED_KEY) {
		const newPath = await getNewTimestampedNotebookFilepath(plugin, instigatingFile);
		return plugin.app.vault.copy(file, newPath);
	}

	return null;
}

////////

export function installEmbedPastePrompt(plugin: InkPlugin) {
	plugin.registerEvent(plugin.app.workspace.on('editor-paste', (evt: ClipboardEvent, editor: Editor) => {
		// Another handler already claimed this paste.
		if (evt.defaultPrevented) return;

		const text = evt.clipboardData?.getData('text/plain');
		if (!text) return;

		const parsed = parseEmbedBlock(text);
		if (!parsed) return; // not one of ours — let Obsidian paste it normally

		evt.preventDefault();

		const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
		const existingFile = resolveInkFileFromEmbed(plugin, parsed.data, sourcePath);

		// Nothing to duplicate from — paste the reference and let the missing-file message in the
		// embed itself explain the problem, rather than blocking the paste on a modal.
		if (!existingFile) {
			editor.replaceSelection(parsed.block);
			return;
		}

		new PasteEmbedModal({
			plugin,
			onChoice: async (choice) => {
				if (choice === 'reference') {
					editor.replaceSelection(parsed.block);
					return;
				}

				const instigatingFile = plugin.app.workspace.getActiveFile();
				const newFile = await duplicateForKey(plugin, parsed.key, existingFile, instigatingFile);

				if (!newFile) {
					new Notice("Couldn't duplicate that ink file — pasted as a reference instead.");
					editor.replaceSelection(parsed.block);
					return;
				}

				// Everything else about the embed is worth keeping: a duplicate of a framed,
				// height-capped embed should look the same until it's changed.
				const duplicatedData: Record<string, any> = {
					...parsed.data,
					link: `[[${newFile.basename}.${newFile.extension}]]`,
				};
				delete duplicatedData.filepath; // legacy field would override the new link

				editor.replaceSelection(buildEmbedBlock(parsed.key, duplicatedData));
			},
		}).open();
	}));
}

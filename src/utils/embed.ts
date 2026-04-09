
///////
///////

import { EditorPosition, MarkdownPostProcessorContext, MarkdownViewModeType } from "obsidian";
import { DRAW_EMBED_KEY, DRAWING_INITIAL_ASPECT_RATIO, DRAWING_INITIAL_HEIGHT, DRAWING_INITIAL_WIDTH, NOTEBOOK_EMBED_KEY, PLUGIN_VERSION, WRITE_EMBED_KEY } from "src/constants";
import InkPlugin from "src/main";

export type WritingEmbedData = {
	versionAtEmbed: string;
	link?: string;
	filepath?: string; // legacy — kept for backward compat with old embeds
	transcript?: string;
	collapsed?: boolean;
	title?: string;
};


// Primary functions
///////

export const buildWritingEmbed = (filepath: string, transcript?: string) => {
	const basename = filepath.split('/').pop() ?? filepath;
	let embedContent: WritingEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
		link: `[[${basename}]]`,
		// transcript,
	}

	let embedStr = "";
    embedStr += "\n```" + WRITE_EMBED_KEY;
    embedStr += "\n" + formatEmbedJson(embedContent as Record<string, unknown>);
    embedStr += "\n```";
	
	// Adds a blank line at the end so it's easy to place the cursor after
    embedStr += "\n";

	return embedStr;
};

//////////
//////////

export type NotebookEmbedData = {
	versionAtEmbed: string;
	link?: string;
	filepath?: string; // legacy — kept for backward compat with old embeds
	collapsed?: boolean;
	title?: string;
	currentPage?: number;
};

export const buildNotebookEmbed = (filepath: string) => {
	const basename = filepath.split('/').pop() ?? filepath;
	let embedContent: NotebookEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
		link: `[[${basename}]]`,
	}

	let embedStr = "";
    embedStr += "\n```" + NOTEBOOK_EMBED_KEY;
    embedStr += "\n" + formatEmbedJson(embedContent as Record<string, unknown>);
    embedStr += "\n```";
    embedStr += "\n";

	return embedStr;
};

//////////
//////////

export type DrawingEmbedData = {
	versionAtEmbed: string;
	link?: string;
	filepath?: string; // legacy — kept for backward compat with old embeds
	width?: number,
	aspectRatio?: number,
	collapsed?: boolean,
	title?: string,
};

export const buildDrawingEmbed = (filepath: string) => {
	const basename = filepath.split('/').pop() ?? filepath;
	let embedContent: DrawingEmbedData = {
		versionAtEmbed: PLUGIN_VERSION,
		link: `[[${basename}]]`,
		width: DRAWING_INITIAL_WIDTH,
		aspectRatio: DRAWING_INITIAL_ASPECT_RATIO,
	}

	let embedStr = "";
    embedStr += "\n```" + DRAW_EMBED_KEY;
    embedStr += "\n" + formatEmbedJson(embedContent as Record<string, unknown>);
    embedStr += "\n```";

	// Adds a blank line at the end so it's easy to place the cursor after
    embedStr += "\n";

	return embedStr;
};

/**
 * Resolves a TFile from embed data, supporting both new `link` (wikilink) and legacy `filepath` formats.
 */
export function resolveInkFileFromEmbed(
	plugin: InkPlugin,
	embedData: { link?: string; filepath?: string },
	sourcePath: string
): import('obsidian').TFile | null {
	if (embedData.link) {
		const linktext = embedData.link.replace(/^\[\[|\]\]$/g, '');
		return plugin.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath) as import('obsidian').TFile | null;
	}
	if (embedData.filepath) {
		return plugin.app.vault.getAbstractFileByPath(embedData.filepath) as import('obsidian').TFile | null;
	}
	return null;
}

/**
 * When an ink file is renamed, scans all markdown files and updates the [[wikilink]] inside embed code blocks.
 */
export async function updateInkEmbedLinksInVault(plugin: InkPlugin, newPath: string, oldPath: string) {
	const oldBasename = oldPath.split('/').pop();
	const newBasename = newPath.split('/').pop();
	if (!oldBasename || !newBasename || oldBasename === newBasename) return;

	const oldLink = `[[${oldBasename}]]`;
	const newLink = `[[${newBasename}]]`;

	const markdownFiles = plugin.app.vault.getMarkdownFiles();
	for (const mdFile of markdownFiles) {
		const content = await plugin.app.vault.read(mdFile);
		if (!content.includes(oldLink)) continue;
		await plugin.app.vault.modify(mdFile, content.split(oldLink).join(newLink));
	}
}

/** Produces a compact single-line JSON string with spaces after : and , for readability. */
function formatEmbedJson(obj: Record<string, unknown>): string {
	const pairs = Object.entries(obj)
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `"${k}": ${JSON.stringify(v)}`);
	return '{' + pairs.join(', ') + '}';
}

export function stringifyEmbedData(embedData: DrawingEmbedData): string {
	return formatEmbedJson(embedData as Record<string, unknown>);
}
export const rebuildDrawingEmbed = (embedData: DrawingEmbedData) => {
	let embedStr = "";
    embedStr += "\n```" + DRAW_EMBED_KEY;
    embedStr += "\n" + stringifyEmbedData(embedData);
    embedStr += "\n```";
	return embedStr;
};

/**
 * Updates the JSON content of a writing embed code block without changing its boundaries.
 */
export function updateWritingEmbedData(plugin: InkPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement, embedData: WritingEmbedData) {
	const cmEditor = plugin.app.workspace.activeEditor?.editor;
	if(!cmEditor) return;

	const sectionInfo = ctx.getSectionInfo(el);
	if(sectionInfo?.lineStart === undefined || sectionInfo.lineEnd === undefined) return;

	// Replace only the JSON content lines (between the opening ``` and closing ```)
	const editorStart: EditorPosition = {
		line: sectionInfo.lineStart + 1,
		ch: 0,
	}
	const editorEnd: EditorPosition = {
		line: sectionInfo.lineEnd,
		ch: 0,
	}

	cmEditor.replaceRange(formatEmbedJson(embedData as Record<string, unknown>) + '\n', editorStart, editorEnd);
}

// This function came from Notion like tables code
export const getViewMode = (el: HTMLElement): MarkdownViewModeType | null => {
	const parent = el.parentElement;
	if (parent) {
		return parent.className.includes("cm-preview-code-block")
			? "source"
			: "preview";
	}
	return null;
};

export function applyCommonAncestorStyling(embedEl: HTMLElement) {
	const parentEmbedBlockEl = embedEl.closest('.cm-embed-block') as HTMLElement;
	if(!parentEmbedBlockEl) return;

	parentEmbedBlockEl.classList.add('ddc_ink_embed-block');

	// When Readable Line Length is enabled, the scroller padding creates the reading column.
	// Negating that padding would blow past the column to full viewport width, so skip it.
	if(document.body.classList.contains('is-readable-line-width')) return;

	const parentPageScrollerEl = embedEl.closest('.cm-scroller') as HTMLElement;
	const scrollerStyle = window.getComputedStyle(parentPageScrollerEl);

	const scrollerInlineStartMargin = scrollerStyle.paddingInlineStart;
	const scrollerInlineEndMargin = scrollerStyle.paddingInlineEnd;
	const scrollerMarginLeft = scrollerStyle.paddingLeft;
	const scrollerMarginRight = scrollerStyle.paddingRight;

	// Verify the embed block's offset from the scroller closely matches the scroller padding.
	// In the default theme (no readable line length), the content starts at the padding edge,
	// so negating the padding extends the embed to the scroller edge.
	// Themes like Minimal use .cm-sizer width constraints + auto margins to center content,
	// so the embed's offset from the scroller is much larger than the padding. In that case,
	// applying a negative margin would push the embed off-screen to the left.
	const scrollerRect = parentPageScrollerEl.getBoundingClientRect();
	const embedRect = parentEmbedBlockEl.getBoundingClientRect();

	const startMarginValue = parseFloat(scrollerInlineStartMargin) || 0;
	const endMarginValue = parseFloat(scrollerInlineEndMargin) || 0;
	const embedStartOffset = embedRect.left - scrollerRect.left;
	const embedEndOffset = scrollerRect.right - embedRect.right;

	// Only negate padding if the embed's offset closely matches the scroller padding
	// (tolerance of 20px to account for sub-pixel rounding and minor theme adjustments)
	const pageHasScrollerInlineStartMargin = scrollerInlineStartMargin && scrollerInlineStartMargin !== '0' && scrollerInlineStartMargin !== '0px';
	if(pageHasScrollerInlineStartMargin && Math.abs(embedStartOffset - startMarginValue) < 20) {
		let style = parentEmbedBlockEl.getAttribute('style') ?? '';
		style += `; margin-inline-start: calc(-1 * ${scrollerInlineStartMargin} + 4px) !important`;
		parentEmbedBlockEl.setAttribute('style', style);
	}

	const pageHasScrollerInlineEndMargin = scrollerInlineEndMargin && scrollerInlineEndMargin !== '0' && scrollerInlineEndMargin !== '0px';
	if(pageHasScrollerInlineEndMargin && Math.abs(embedEndOffset - endMarginValue) < 20) {
		let style = parentEmbedBlockEl.getAttribute('style') ?? '';
		style += `; margin-inline-end: calc(-1 * ${scrollerInlineEndMargin} + 4px) !important`;
		parentEmbedBlockEl.setAttribute('style', style);
	}
}

/**
 * Removes an element from a markdown in the active editor.
 * Pass in the context and el used when creating the embed.
 * @param plugin 
 * @param ctx 
 * @param el 
 * @returns 
 */
export function removeEmbed(plugin: InkPlugin, ctx: MarkdownPostProcessorContext, el: HTMLElement) {
	const cmEditor = plugin.app.workspace.activeEditor?.editor;
	if(!cmEditor) return;

	const sectionInfo = ctx.getSectionInfo(el);

	if(sectionInfo?.lineStart === undefined || sectionInfo.lineEnd === undefined) return;

	const editorStart: EditorPosition = {
		line: sectionInfo.lineStart,
		ch: 0,
	}
	const editorEnd: EditorPosition = {
		line: sectionInfo.lineEnd + 1,
		ch: 0,
	}

	cmEditor.replaceRange( '', editorStart, editorEnd );

	// NOTE: The page scroll position can jump significantly off when an embed is removed.
	// This puts it back where the user expects.
	cmEditor.setCursor(editorStart);
}
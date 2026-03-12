import { MarkdownRenderChild, TFile } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { InkFileData, stringifyPageData } from "src/utils/page-file";
import { NotebookEmbedData, applyCommonAncestorStyling, removeEmbed } from "src/utils/embed";
import InkPlugin from "src/main";
import NotebookEmbed from "src/tldraw/notebook/notebook-embed";
import { NOTEBOOK_EMBED_KEY } from "src/constants";
import {
	Provider as JotaiProvider
} from "jotai";

////////
////////

interface EmbedCtrls {
	removeEmbed: Function,
	updateEmbedData: (embedData: NotebookEmbedData) => void,
}

////////

export function registerNotebookEmbed(plugin: InkPlugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		NOTEBOOK_EMBED_KEY,
		(source, el, ctx) => {
			const embedData = JSON.parse(source) as NotebookEmbedData;
			const embedCtrls: EmbedCtrls = {
				removeEmbed: () => removeEmbed(plugin, ctx, el),
				updateEmbedData: (data: NotebookEmbedData) => {
					// Reuse the writing embed data update mechanism
					const cmEditor = plugin.app.workspace.activeEditor?.editor;
					if(!cmEditor) return;
					const sectionInfo = ctx.getSectionInfo(el);
					if(sectionInfo?.lineStart === undefined || sectionInfo.lineEnd === undefined) return;
					const editorStart = { line: sectionInfo.lineStart + 1, ch: 0 };
					const editorEnd = { line: sectionInfo.lineEnd, ch: 0 };
					cmEditor.replaceRange(JSON.stringify(data, null, '\t') + '\n', editorStart, editorEnd);
				},
			}
			if(embedData.filepath) {
				ctx.addChild(new NotebookEmbedWidget(el, plugin, embedData, embedCtrls));
			}
		}
	);
}

class NotebookEmbedWidget extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: InkPlugin;
	embedData: NotebookEmbedData;
	embedCtrls: EmbedCtrls;
	root: Root;
	fileRef: TFile | null;

	constructor(
		el: HTMLElement,
		plugin: InkPlugin,
		embedData: NotebookEmbedData,
		embedCtrls: EmbedCtrls,
	) {
		super(el);
		this.el = el;
		this.plugin = plugin;
		this.embedData = embedData;
		this.embedCtrls = embedCtrls;
	}

	async onload() {
		const v = this.plugin.app.vault;
		this.fileRef = v.getAbstractFileByPath(this.embedData.filepath) as TFile;

		if( !this.fileRef || !(this.fileRef instanceof TFile) ) {
			this.el.createEl('p').textContent = 'Ink notebook file not found: ' + this.embedData.filepath;
			return;
		}

		const pageDataStr = await v.read(this.fileRef);
		const pageData = JSON.parse(pageDataStr) as InkFileData;

		if(!this.root) this.root = createRoot(this.el);
		this.root.render(
			<JotaiProvider>
				<NotebookEmbed
					plugin = {this.plugin}
					notebookFileRef = {this.fileRef}
					pageData = {pageData}
					embedData = {this.embedData}
					save = {this.save}
					remove = {this.embedCtrls.removeEmbed}
					onCollapsedChange = {(collapsed: boolean) => {
						const updatedData = { ...this.embedData, collapsed };
						this.embedData = updatedData;
						this.embedCtrls.updateEmbedData(updatedData);
					}}
				/>
			</JotaiProvider>
		);

		applyCommonAncestorStyling(this.el)
	}

	async onunload() {
		this.root?.unmount();
	}

	save = async (pageData: InkFileData) => {
		if(!this.fileRef) return;
		const pageDataStr = stringifyPageData(pageData);
		await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
	}

}

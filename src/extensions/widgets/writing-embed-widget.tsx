// import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls';
import { MarkdownRenderChild, MarkdownView, TFile } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { InkFileData, stringifyPageData } from "src/utils/page-file";
import { WritingEmbedData as WritingEmbedData, applyCommonAncestorStyling, removeEmbed, updateWritingEmbedData } from "src/utils/embed";
import InkPlugin from "src/main";
import WritingEmbed from "src/tldraw/writing/writing-embed";
import { WRITE_EMBED_KEY } from "src/constants";
import { 
	Provider as JotaiProvider
} from "jotai";

////////
////////

interface EmbedCtrls {
	removeEmbed: Function,
	updateEmbedData: (embedData: WritingEmbedData) => void,
}

////////

export function registerWritingEmbed(plugin: InkPlugin) {
	plugin.registerMarkdownCodeBlockProcessor(
		WRITE_EMBED_KEY,
		(source, el, ctx) => {
			const embedData = JSON.parse(source) as WritingEmbedData;
			const embedCtrls: EmbedCtrls = {
				removeEmbed: () => removeEmbed(plugin, ctx, el),
				updateEmbedData: (data: WritingEmbedData) => updateWritingEmbedData(plugin, ctx, el, data),
			}
			if(embedData.filepath) {
				ctx.addChild(new WritingEmbedWidget(el, plugin, embedData, embedCtrls));
			}
		}
	);
}

class WritingEmbedWidget extends MarkdownRenderChild {
	el: HTMLElement;
	plugin: InkPlugin;
	embedData: WritingEmbedData;
	embedCtrls: EmbedCtrls;
	root: Root;
	fileRef: TFile | null;
	
	constructor(
		el: HTMLElement,
		plugin: InkPlugin,
		embedData: WritingEmbedData,
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
			this.el.createEl('p').textContent = 'Ink writing file not found: ' + this.embedData.filepath;
			return;
		}

		const pageDataStr = await v.read(this.fileRef);
		const pageData = JSON.parse(pageDataStr) as InkFileData;

		if(!this.root) this.root = createRoot(this.el);
		this.root.render(
			<JotaiProvider>
				<WritingEmbed
					plugin = {this.plugin}
					writingFileRef = {this.fileRef}
					pageData = {pageData}
					embedData = {this.embedData}
					save = {this.save}
					remove = {this.embedCtrls.removeEmbed}
					onCollapsedChange = {(collapsed: boolean) => {
						const updatedData = { ...this.embedData, collapsed };
						this.embedData = updatedData;
						this.embedCtrls.updateEmbedData(updatedData);
					}}
					onTitleChange = {(title: string) => {
						this.renameWritingFile(title);
					}}
				/>
			</JotaiProvider>
		);

		applyCommonAncestorStyling(this.el)
	}

	async onunload() {
		this.root?.unmount();
	}

	// Helper functions
	///////////////////

	save = async (pageData: InkFileData) => {

		if(!this.fileRef) return;
		const pageDataStr = stringifyPageData(pageData);
		await this.plugin.app.vault.modify(this.fileRef, pageDataStr);
	}

	renameWritingFile = async (title: string) => {
		if(!this.fileRef) return;

		const oldPath = this.fileRef.path;
		const dir = oldPath.substring(0, oldPath.lastIndexOf('/'));
		const ext = this.fileRef.extension;

		// Extract the date portion from the filename (everything before the first space, or the whole basename)
		const oldBasename = this.fileRef.basename;
		const spaceIndex = oldBasename.indexOf(' ');
		const datePart = spaceIndex >= 0 ? oldBasename.substring(0, spaceIndex) : oldBasename;

		const newBasename = title ? `${datePart} ${title}` : datePart;
		const newPath = `${dir}/${newBasename}.${ext}`;

		if(newPath === oldPath) return;

		await this.plugin.app.vault.rename(this.fileRef, newPath);

		// Update embed data with new filepath
		const updatedData = { ...this.embedData, filepath: newPath, title: title || undefined };
		this.embedData = updatedData;
		this.embedCtrls.updateEmbedData(updatedData);
	}

}
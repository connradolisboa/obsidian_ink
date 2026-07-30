import { TFile, TextFileView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import { Root, createRoot } from "react-dom/client";
import { NOTEBOOK_FILE_EXT } from "src/constants";
import InkPlugin from "src/main";
import { TldrawNotebookEditor } from "src/tldraw/notebook/tldraw-notebook-editor";
import { InkFileData, stringifyPageData } from "src/utils/page-file";

////////
////////

export const NOTEBOOK_VIEW_TYPE = "inkc_notebook-view";

////////

export function registerNotebookView (plugin: InkPlugin) {
    plugin.registerView(
        NOTEBOOK_VIEW_TYPE,
        (leaf) => new NotebookView(leaf, plugin)
    );
    plugin.registerExtensions([NOTEBOOK_FILE_EXT], NOTEBOOK_VIEW_TYPE);
}

export class NotebookView extends TextFileView {
    root: null | Root;
    plugin: InkPlugin;
    pageData: InkFileData;
    focusModeActive: boolean = false;
    tldrawControls: {
        resize?: Function,
    } = {}

    constructor(leaf: WorkspaceLeaf, plugin: InkPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return NOTEBOOK_VIEW_TYPE;
    }

    getDisplayText = () => {
        return this.file?.basename || "Notebook";
    }

    setViewData = (fileContents: string, clear: boolean) => {
        if(!this.file) return;

        const pageData = JSON.parse(fileContents) as InkFileData;
        this.pageData = pageData;

        const viewContent = this.containerEl.children[1];
        viewContent.setAttr('style', 'padding: 0;');

        this.enableFocusMode();

        if(this.root) this.clear();

        this.root = createRoot(viewContent);
		this.root.render(
            <TldrawNotebookEditor
                plugin = {this.plugin}
                notebookFile = {this.file}
                save = {this.saveFile}
                saveControlsReference = {(controls: any) => {
                    this.tldrawControls.resize = controls.resize;
                }}
                onExitFocusMode = {this.focusModeActive ? () => this.disableFocusMode() : undefined}
			/>
        );
    }

    saveFile = (pageData: InkFileData) => {
        this.pageData = pageData;
        this.save(false);
    }

    getViewData = (): string => {
        return stringifyPageData(this.pageData);
    }

    clear = (): void => {
        this.root?.unmount();
        this.disableFocusMode();
    }

    onunload(): void {
        this.disableFocusMode();
    }

    enableFocusMode(): void {
        if(this.plugin.settings.fullscreenFocusMode && !this.focusModeActive) {
            this.focusModeActive = true;
            document.body.classList.add('inkc_focus-mode');
        }
    }

    disableFocusMode(): void {
        if(this.focusModeActive) {
            this.focusModeActive = false;
            document.body.classList.remove('inkc_focus-mode');
        }
    }

    onResize = () => {
    }

}

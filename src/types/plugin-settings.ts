////////
////////

export interface PluginSettings {
	// Helpers
    onboardingTips: {
		welcomeTipRead: boolean,
		strokeLimitTipRead: boolean,
		lastVersionTipRead: string,
	},
	// General
	customAttachmentFolders: boolean,
    noteAttachmentFolderLocation: 'obsidian' | 'root' | 'note',
    notelessAttachmentFolderLocation: 'obsidian' | 'root',
	writingSubfolder: string,
	drawingSubfolder: string,
	notebookSubfolder: string,
	// Writing specific
	writingEnabled: boolean,
	writingStrokeLimit: number,
	writingDynamicStrokeThickness: boolean,
	writingSmoothing: boolean,
	writingStreamline: number,
	stylusOnlyInput: boolean,
	fingerSwipeScroll: boolean,
	showScrollButtons: boolean,
	fullscreenFocusMode: boolean,
	closeNoteOnFullscreen: boolean,
	writingManualLineAdd: boolean,
	writingLinesWhenLocked: boolean,
	writingBackgroundWhenLocked: boolean,
	// Notebook specific
	notebookEnabled: boolean,
	notebookLinesPerPage: number,
	notebookStrokeLimit: number,
	notebookLinesWhenLocked: boolean,
	notebookBackgroundWhenLocked: boolean,
	// Drawing specific
	drawingEnabled: boolean,
	drawingFrameWhenLocked: boolean,
	drawingBackgroundWhenLocked: boolean,
}

export const DEFAULT_SETTINGS: PluginSettings = {
	// Helpers
    onboardingTips: {
		welcomeTipRead: false,
		strokeLimitTipRead: false,
		lastVersionTipRead: '',
	},
	// General
	customAttachmentFolders: false,
    noteAttachmentFolderLocation: 'obsidian',
	notelessAttachmentFolderLocation: 'obsidian',
	writingSubfolder: 'Ink/Writing',
	drawingSubfolder: 'Ink/Drawing',
	notebookSubfolder: 'Ink/Notebook',
	// Writing specific
	writingEnabled: true,
	writingStrokeLimit: 200,
	writingDynamicStrokeThickness: true,
	writingSmoothing: false,
	writingStreamline: 0.1,
	stylusOnlyInput: false,
	fingerSwipeScroll: false,
	showScrollButtons: true,
	fullscreenFocusMode: false,
	closeNoteOnFullscreen: false,
	writingManualLineAdd: false,
	writingLinesWhenLocked: true,
	writingBackgroundWhenLocked: true,
	// Notebook specific
	notebookEnabled: true,
	notebookLinesPerPage: 10,
	notebookStrokeLimit: 200,
	notebookLinesWhenLocked: true,
	notebookBackgroundWhenLocked: true,
	// Drawing specific
	drawingEnabled: true,
	drawingFrameWhenLocked: false,
	drawingBackgroundWhenLocked: false,
}

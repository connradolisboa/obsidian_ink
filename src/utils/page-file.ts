import { TLEditorSnapshot } from '@tldraw/tldraw';
import { PLUGIN_VERSION, TLDRAW_VERSION } from 'src/constants';

///////
///////

type Metadata = {
	pluginVersion: string;
	tldrawVersion: string;
	previewIsOutdated?: boolean;
	transcript?: string;
};

export type InkFileData = {
	meta: Metadata;
	tldraw: TLEditorSnapshot;
	previewUri?: string;
	pagePreviewUris?: string[];
};

// Primary functions
///////

export const buildWritingFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	transcript?: string;
	previewUri?: string,
	pagePreviewUris?: string[],
}): InkFileData => {

	return buildFileData(props);
}

export const buildDrawingFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	previewUri?: string,
}): InkFileData => {

	return buildFileData(props);
}

const buildFileData = (props: {
	tlEditorSnapshot: TLEditorSnapshot,
	previewIsOutdated?: boolean;
	transcript?: string;
	previewUri?: string,
	pagePreviewUris?: string[],
}): InkFileData => {

	const {
		tlEditorSnapshot: tlEditorSnapshot,
		previewUri,
		previewIsOutdated = false,
		pagePreviewUris,
	} = props;

	let pageData: InkFileData = {
		meta: {
			pluginVersion: PLUGIN_VERSION,
			tldrawVersion: TLDRAW_VERSION,
		},
		tldraw: tlEditorSnapshot,
	}

	if(previewIsOutdated) pageData.meta.previewIsOutdated = previewIsOutdated;
	if(previewUri) pageData.previewUri = previewUri;
	if(pagePreviewUris) pageData.pagePreviewUris = pagePreviewUris;

	return pageData;
};

export const stringifyPageData = (pageData: InkFileData): string => {
	return JSON.stringify(pageData, null, '\t');
}
import { Editor, TLPageId, createShapeId } from "@tldraw/tldraw";
import { WRITING_LINE_HEIGHT, WRITING_MIN_PAGE_HEIGHT, WRITING_PAGE_WIDTH } from "src/constants";
import { getWritingContainerId, getWritingLinesId, initWritingCamera, silentlyChangeStore } from "./tldraw-helpers";

////////
////////

/**
 * Creates a new writing page with its own writing-container and writing-lines shapes.
 * The page height is determined by linesPerPage * WRITING_LINE_HEIGHT.
 */
export function createWritingPage(editor: Editor, pageIndex: number, linesPerPage: number): TLPageId {
	const pageId = `page:writingPage${pageIndex}` as TLPageId;
	const pageHeight = linesPerPage * WRITING_LINE_HEIGHT;

	silentlyChangeStore(editor, () => {
		editor.createPage({
			id: pageId,
			name: `Page ${pageIndex + 1}`,
		});

		// Switch to the new page to create shapes on it
		const previousPageId = editor.getCurrentPageId();
		editor.setCurrentPage(pageId);

		editor.createShape({
			id: getWritingLinesId(pageIndex),
			type: 'writing-lines',
			x: 0,
			y: 0,
			isLocked: true,
			props: {
				x: 0,
				y: 0,
				w: WRITING_PAGE_WIDTH,
				h: pageHeight,
			},
		});

		editor.createShape({
			id: getWritingContainerId(pageIndex),
			type: 'writing-container',
			x: 0,
			y: 0,
			isLocked: true,
			props: {
				x: 0,
				y: 0,
				w: WRITING_PAGE_WIDTH,
				h: pageHeight,
			},
		});

		// Switch back to the previous page
		editor.setCurrentPage(previousPageId);
	});

	return pageId;
}

/**
 * Returns the total number of pages in the editor.
 */
export function getPageCount(editor: Editor): number {
	return editor.getPages().length;
}

/**
 * Returns the sorted array of page IDs.
 */
export function getPageIds(editor: Editor): TLPageId[] {
	return editor.getPages().map(p => p.id);
}

/**
 * Returns the index (0-based) of the current page.
 */
export function getCurrentPageIndex(editor: Editor): number {
	const pages = editor.getPages();
	const currentId = editor.getCurrentPageId();
	return pages.findIndex(p => p.id === currentId);
}

/**
 * Navigate to a specific page by index and reinitialize the camera.
 */
export function navigateToPage(editor: Editor, pageIndex: number, topMarginPx: number = 0) {
	const pages = editor.getPages();
	if (pageIndex < 0 || pageIndex >= pages.length) return;

	const targetPage = pages[pageIndex];
	silentlyChangeStore(editor, () => {
		editor.setCurrentPage(targetPage.id);
	});
	initWritingCamera(editor, topMarginPx);
}

/**
 * Navigate to the next page. Returns true if navigation occurred.
 */
export function navigateToNextPage(editor: Editor, topMarginPx: number = 0): boolean {
	const currentIndex = getCurrentPageIndex(editor);
	const pageCount = getPageCount(editor);
	if (currentIndex < pageCount - 1) {
		navigateToPage(editor, currentIndex + 1, topMarginPx);
		return true;
	}
	return false;
}

/**
 * Navigate to the previous page. Returns true if navigation occurred.
 */
export function navigateToPrevPage(editor: Editor, topMarginPx: number = 0): boolean {
	const currentIndex = getCurrentPageIndex(editor);
	if (currentIndex > 0) {
		navigateToPage(editor, currentIndex - 1, topMarginPx);
		return true;
	}
	return false;
}

/**
 * Check if any stroke on the current page extends beyond the page height.
 */
export function detectPageOverflow(editor: Editor, pageHeight: number): boolean {
	const shapes = editor.getCurrentPageShapes();
	for (const shape of shapes) {
		if (shape.type !== 'draw') continue;
		const bounds = editor.getShapePageBounds(shape.id);
		if (bounds && bounds.maxY > pageHeight) {
			return true;
		}
	}
	return false;
}

/**
 * Initialize the first page in pages mode from an existing single-page file.
 * Converts the default page into page 0 with fixed height.
 */
export function initializePagesMode(editor: Editor, linesPerPage: number) {
	const pages = editor.getPages();
	const pageHeight = linesPerPage * WRITING_LINE_HEIGHT;

	if (pages.length === 1) {
		// Existing single-page file — resize the container and lines to fixed page height
		const containerId = getWritingContainerId();
		const linesId = getWritingLinesId();

		const container = editor.getShape(containerId);
		const lines = editor.getShape(linesId);

		if (container && lines) {
			silentlyChangeStore(editor, () => {
				editor.store.update(containerId, (record: any) => {
					const updated = JSON.parse(JSON.stringify(record));
					updated.isLocked = false;
					return updated;
				});
				editor.updateShape({
					id: containerId,
					type: 'writing-container',
					props: { h: pageHeight },
				});
				editor.store.update(containerId, (record: any) => {
					const updated = JSON.parse(JSON.stringify(record));
					updated.isLocked = true;
					return updated;
				});

				editor.store.update(linesId, (record: any) => {
					const updated = JSON.parse(JSON.stringify(record));
					updated.isLocked = false;
					return updated;
				});
				editor.updateShape({
					id: linesId,
					type: 'writing-lines',
					props: { h: pageHeight },
				});
				editor.store.update(linesId, (record: any) => {
					const updated = JSON.parse(JSON.stringify(record));
					updated.isLocked = true;
					return updated;
				});
			});
		}
	}
}

import * as React from 'react';
import './page-navigation.scss';
import { Editor } from '@tldraw/tldraw';
import { getCurrentPageIndex, getPageCount, navigateToNextPage, navigateToPrevPage, createWritingPage } from 'src/utils/writing-pages';

///////////
///////////

interface PageNavigationProps {
	editor?: Editor;
	getTlEditor?: () => Editor | undefined;
	linesPerPage: number;
	topMarginPx?: number;
	readOnly?: boolean;
	onPageChange?: (pageIndex: number) => void;
}

export const PageNavigation: React.FC<PageNavigationProps> = (props) => {
	const [currentPage, setCurrentPage] = React.useState(0);
	const [totalPages, setTotalPages] = React.useState(1);

	const getEditor = (): Editor | undefined => {
		return props.editor ?? props.getTlEditor?.();
	};

	const syncPageState = React.useCallback(() => {
		const editor = getEditor();
		if (!editor) return;
		setCurrentPage(getCurrentPageIndex(editor));
		setTotalPages(getPageCount(editor));
	}, [props.editor, props.getTlEditor]);

	React.useEffect(() => {
		const editor = getEditor();
		if (!editor) return;
		syncPageState();

		let lastPageIndex = getCurrentPageIndex(editor);
		let lastPageCount = getPageCount(editor);

		const unsub = editor.store.listen(() => {
			const ed = getEditor();
			if (!ed) return;
			const newIndex = getCurrentPageIndex(ed);
			const newCount = getPageCount(ed);
			if (newIndex !== lastPageIndex || newCount !== lastPageCount) {
				lastPageIndex = newIndex;
				lastPageCount = newCount;
				setCurrentPage(newIndex);
				setTotalPages(newCount);
			}
		}, { source: 'all', scope: 'all' });
		return unsub;
	}, [props.editor, props.getTlEditor]);

	function handlePrev(e: React.PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const editor = getEditor();
		if (!editor) return;
		if (navigateToPrevPage(editor, props.topMarginPx)) {
			syncPageState();
			props.onPageChange?.(getCurrentPageIndex(editor));
		}
	}

	function handleNext(e: React.PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const editor = getEditor();
		if (!editor) return;
		if (navigateToNextPage(editor, props.topMarginPx)) {
			syncPageState();
			props.onPageChange?.(getCurrentPageIndex(editor));
		}
	}

	function handleAddPage(e: React.PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const editor = getEditor();
		if (!editor) return;
		const newPageIndex = getPageCount(editor);
		createWritingPage(editor, newPageIndex, props.linesPerPage);
		navigateToNextPage(editor, props.topMarginPx);
		syncPageState();
		props.onPageChange?.(getCurrentPageIndex(editor));
	}

	const isFirstPage = currentPage === 0;
	const isLastPage = currentPage === totalPages - 1;

	return (
		<div className="ink_page-navigation">
			<button
				className="ink_page-nav-button"
				onPointerDown={handlePrev}
				aria-label="Previous page"
				disabled={isFirstPage}
			>
				<svg xmlns="http://www.w3.org/2000/svg" height={20} viewBox="0 -960 960 960" width={20}>
					<path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
				</svg>
			</button>

			<span className="ink_page-indicator">
				{currentPage + 1} / {totalPages}
			</span>

			{isLastPage && !props.readOnly ? (
				<button
					className="ink_page-nav-button ink_page-add-button"
					onPointerDown={handleAddPage}
					aria-label="Add page"
				>
					<svg xmlns="http://www.w3.org/2000/svg" height={20} viewBox="0 -960 960 960" width={20}>
						<path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
					</svg>
				</button>
			) : (
				<button
					className="ink_page-nav-button"
					onPointerDown={handleNext}
					aria-label="Next page"
					disabled={isLastPage}
				>
					<svg xmlns="http://www.w3.org/2000/svg" height={20} viewBox="0 -960 960 960" width={20}>
						<path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
					</svg>
				</button>
			)}
		</div>
	);
};

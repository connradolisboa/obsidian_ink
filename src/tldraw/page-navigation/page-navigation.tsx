import * as React from 'react';
import './page-navigation.scss';
import { Editor } from '@tldraw/tldraw';
import { getCurrentPageIndex, getPageCount, navigateToNextPage, navigateToPrevPage, createWritingPage } from 'src/utils/writing-pages';
import { WRITING_LINE_HEIGHT } from 'src/constants';

///////////
///////////

interface PageNavigationProps {
	getTlEditor: () => Editor | undefined;
	linesPerPage: number;
	topMarginPx?: number;
	onPageChange?: () => void;
}

export const PageNavigation: React.FC<PageNavigationProps> = (props) => {
	const [currentPage, setCurrentPage] = React.useState(0);
	const [totalPages, setTotalPages] = React.useState(1);

	// Sync state with editor on mount and after navigation
	const syncPageState = React.useCallback(() => {
		const editor = props.getTlEditor();
		if (!editor) return;
		setCurrentPage(getCurrentPageIndex(editor));
		setTotalPages(getPageCount(editor));
	}, [props.getTlEditor]);

	React.useEffect(() => {
		syncPageState();
		// Listen for page changes from the editor
		const editor = props.getTlEditor();
		if (!editor) return;
		const unsub = editor.store.listen(() => {
			const newIndex = getCurrentPageIndex(editor);
			const newCount = getPageCount(editor);
			if (newIndex !== currentPage || newCount !== totalPages) {
				setCurrentPage(newIndex);
				setTotalPages(newCount);
			}
		}, { source: 'all', scope: 'all' });
		return unsub;
	}, [props.getTlEditor]);

	function handlePrev(e: React.PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const editor = props.getTlEditor();
		if (!editor) return;
		if (navigateToPrevPage(editor, props.topMarginPx)) {
			syncPageState();
			props.onPageChange?.();
		}
	}

	function handleNext(e: React.PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const editor = props.getTlEditor();
		if (!editor) return;
		if (navigateToNextPage(editor, props.topMarginPx)) {
			syncPageState();
			props.onPageChange?.();
		}
	}

	function handleAddPage(e: React.PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const editor = props.getTlEditor();
		if (!editor) return;
		const newPageIndex = getPageCount(editor);
		createWritingPage(editor, newPageIndex, props.linesPerPage);
		navigateToNextPage(editor, props.topMarginPx);
		syncPageState();
		props.onPageChange?.();
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
				{/* Chevron left — Material Symbols Rounded */}
				<svg xmlns="http://www.w3.org/2000/svg" height={20} viewBox="0 -960 960 960" width={20}>
					<path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z" />
				</svg>
			</button>

			<span className="ink_page-indicator">
				{currentPage + 1} / {totalPages}
			</span>

			{isLastPage ? (
				<button
					className="ink_page-nav-button ink_page-add-button"
					onPointerDown={handleAddPage}
					aria-label="Add page"
				>
					{/* Add — Material Symbols Rounded */}
					<svg xmlns="http://www.w3.org/2000/svg" height={20} viewBox="0 -960 960 960" width={20}>
						<path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" />
					</svg>
				</button>
			) : (
				<button
					className="ink_page-nav-button"
					onPointerDown={handleNext}
					aria-label="Next page"
				>
					{/* Chevron right — Material Symbols Rounded */}
					<svg xmlns="http://www.w3.org/2000/svg" height={20} viewBox="0 -960 960 960" width={20}>
						<path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z" />
					</svg>
				</button>
			)}
		</div>
	);
};

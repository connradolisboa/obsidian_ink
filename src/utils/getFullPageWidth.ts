




export function getFullPageWidth(childEl: HTMLElement | null): number {
	// When Readable Line Length is enabled, use the narrower content column width.
	// The default theme constrains via .cm-content, while themes like Minimal
	// constrain via .cm-sizer. Check both to find the tightest constraint.
	if(document.body.classList.contains('is-readable-line-width')) {
		const sizerEl = childEl?.closest('.cm-sizer');
		const contentEl = childEl?.closest('.cm-content');
		const sizerWidth = sizerEl ? (sizerEl as HTMLDivElement).getBoundingClientRect().width : Infinity;
		const contentWidth = contentEl ? (contentEl as HTMLDivElement).getBoundingClientRect().width : Infinity;
		const narrowest = Math.min(sizerWidth, contentWidth);
		if(narrowest !== Infinity) return narrowest;
	}

	const visiblePageAreaEl = childEl?.closest('.cm-scroller');
	if(!visiblePageAreaEl) return 500; // Average number for edge cases where the childEl might not be defined yet
	const maxWidth = (visiblePageAreaEl as HTMLDivElement).getBoundingClientRect().width;
	return maxWidth;
}
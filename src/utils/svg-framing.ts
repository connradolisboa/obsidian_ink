////////
//////// Per-embed framing for drawing previews.
////////
//////// A drawing file holds one preview SVG, but each embed of it can be framed differently, so
//////// the crop can't be baked in at export time — it has to happen when the preview renders.
//////// Rewriting the root <svg>'s viewBox does exactly that, and costs one string replace.
////////

export type EmbedFrame = { x: number, y: number, w: number, h: number };

/**
 * Where the preview SVG's viewBox sits in the drawing's page coordinates, captured when the
 * preview was generated. Needed because tldraw's exported viewBox may be page-positioned or
 * normalised to the origin, and a frame stored in page coordinates has to map onto either.
 */
export type PreviewBounds = { x: number, y: number, w: number, h: number };

const VIEW_BOX_RE = /viewBox\s*=\s*"([^"]*)"/;

function parseViewBox(svg: string): EmbedFrame | undefined {
	const match = svg.match(VIEW_BOX_RE);
	if (!match) return undefined;

	const parts = match[1].trim().split(/[\s,]+/).map(Number);
	if (parts.length !== 4 || parts.some(isNaN)) return undefined;

	return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

/**
 * Returns `svg` cropped to `frame`, or unchanged when there's nothing to apply or anything looks
 * unexpected — a preview that renders uncropped is a much better failure than one that doesn't
 * render at all.
 */
export function applyFrameToSvg(svg: string, frame?: EmbedFrame, previewBounds?: PreviewBounds): string {
	if (!frame || !svg) return svg;

	const viewBox = parseViewBox(svg);
	if (!viewBox || viewBox.w <= 0 || viewBox.h <= 0) return svg;

	// Without recorded bounds, assume the viewBox is already in page coordinates — true when
	// tldraw exports page-positioned, and the identity case for everything below.
	const bounds = previewBounds ?? viewBox;
	if (bounds.w <= 0 || bounds.h <= 0) return svg;

	// Page units -> viewBox user units. 1:1 whenever the export wasn't rescaled.
	const scaleX = viewBox.w / bounds.w;
	const scaleY = viewBox.h / bounds.h;

	const x = viewBox.x + (frame.x - bounds.x) * scaleX;
	const y = viewBox.y + (frame.y - bounds.y) * scaleY;
	const w = frame.w * scaleX;
	const h = frame.h * scaleY;
	if (w <= 0 || h <= 0) return svg;

	const framed = `viewBox="${round(x)} ${round(y)} ${round(w)} ${round(h)}"`;

	// Only the root tag: a nested <svg> (or a stray viewBox in defs) must keep its own box.
	return svg.replace(/<svg\b[^>]*>/, (rootTag) => {
		const withViewBox = VIEW_BOX_RE.test(rootTag)
			? rootTag.replace(VIEW_BOX_RE, framed)
			: rootTag.replace(/^<svg/, `<svg ${framed}`);

		// Fixed width/height attributes would fight the new aspect ratio, so let the container size it.
		return withViewBox
			.replace(/\swidth\s*=\s*"[^"]*"/, '')
			.replace(/\sheight\s*=\s*"[^"]*"/, '');
	});
}

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

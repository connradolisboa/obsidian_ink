import * as React from 'react'
import {
	DrawShapeUtil,
	SVGContainer,
	TLDrawShape,
	SvgExportContext,
} from '@tldraw/tldraw'
import {
	EASINGS,
	TLDefaultSizeStyle,
	TLDrawShapeSegment,
	Vec,
	VecLike,
	getDefaultColorTheme,
	average,
	precise,
	useIsDarkMode,
} from '@tldraw/editor'

function last<T>(arr: readonly T[]): T | undefined {
	return arr[arr.length - 1]
}

////////
// Inlined constants and helpers from tldraw internals to avoid importing
// non-public source files that break TypeScript compilation.

const STROKE_SIZES: Record<TLDefaultSizeStyle, number> = {
	s: 2,
	m: 3.5,
	l: 5,
	xl: 10,
}

interface StrokeOptions {
	size?: number
	thinning?: number
	smoothing?: number
	streamline?: number
	easing?: (pressure: number) => number
	simulatePressure?: boolean
	last?: boolean
}

interface StrokePoint {
	point: Vec
	input: Vec
	vector: Vec
	pressure: number
	distance: number
	runningLength: number
	radius: number
}

function getPointsFromSegments(segments: TLDrawShapeSegment[]) {
	const points: Vec[] = []
	for (const segment of segments) {
		if (segment.type === 'free' || segment.points.length < 2) {
			points.push(...segment.points.map(Vec.Cast))
		} else {
			const pointsToInterpolate = Math.max(
				4,
				Math.floor(Vec.Dist(segment.points[0], segment.points[1]) / 16)
			)
			points.push(...Vec.PointsBetween(segment.points[0], segment.points[1], pointsToInterpolate))
		}
	}
	return points
}

/** Simplified getStrokePoints — inlined from tldraw internals */
function getStrokePoints(rawInputPoints: VecLike[], options: StrokeOptions = {}): StrokePoint[] {
	const { streamline = 0.5, size = 16, simulatePressure = false } = options

	if (rawInputPoints.length === 0) return []

	const t = 0.15 + (1 - streamline) * 0.85
	let pts = rawInputPoints.map(Vec.From)

	if (pts.length === 0)
		return [{
			point: Vec.From(rawInputPoints[0]),
			input: Vec.From(rawInputPoints[0]),
			pressure: simulatePressure ? 0.5 : 0.15,
			vector: new Vec(1, 1),
			distance: 0,
			runningLength: 0,
			radius: 1,
		}]

	// Strip points too close to first
	let pt = pts[1]
	while (pt) {
		if (Vec.Dist2(pt, pts[0]) > (size / 3) ** 2) break
		pts[0].z = Math.max(pts[0].z, pt.z)
		pts.splice(1, 1)
		pt = pts[1]
	}

	// Strip points too close to last
	const lastPt = pts.pop()!
	pt = pts[pts.length - 1]
	while (pt) {
		if (Vec.Dist2(pt, lastPt) > (size / 3) ** 2) break
		pts.pop()
		pt = pts[pts.length - 1]
	}
	pts.push(lastPt)

	const isComplete = options.last || !options.simulatePressure ||
		(pts.length > 1 && Vec.Dist2(pts[pts.length - 1], pts[pts.length - 2]) < size ** 2)

	const strokePoints: StrokePoint[] = [{
		point: pts[0],
		input: pts[0],
		pressure: simulatePressure ? 0.5 : pts[0].z,
		vector: new Vec(1, 1),
		distance: 0,
		runningLength: 0,
		radius: 1,
	}]

	let totalLength = 0
	let prev = strokePoints[0]

	if (isComplete && streamline > 0) {
		pts.push(pts[pts.length - 1].clone())
	}

	for (let i = 1, n = pts.length; i < n; i++) {
		const point = !t || (options.last && i === n - 1)
			? pts[i].clone()
			: pts[i].clone().lrp(prev.point, 1 - t)

		if (prev.point.equals(point)) continue

		const distance = Vec.Dist(point, prev.point)
		totalLength += distance

		if (i < 4 && totalLength < size) continue

		prev = {
			input: pts[i],
			point,
			pressure: simulatePressure ? 0.5 : pts[i].z,
			vector: Vec.Sub(prev.point, point).uni(),
			distance,
			runningLength: totalLength,
			radius: 1,
		}
		strokePoints.push(prev)
	}

	if (strokePoints[1]?.vector) {
		strokePoints[0].vector = strokePoints[1].vector.clone()
	}

	if (totalLength < 1) {
		const maxPressure = Math.max(0.5, ...strokePoints.map(s => s.pressure))
		strokePoints.forEach(s => (s.pressure = maxPressure))
	}

	return strokePoints
}

/** Inlined from tldraw freehand/svg.ts */
function getSvgPathFromStrokePoints(points: StrokePoint[], closed = false): string {
	const len = points.length
	if (len < 2) return ''

	let a = points[0].point
	let b = points[1].point

	if (len === 2) return `M${precise(a)}L${precise(b)}`

	let result = ''
	for (let i = 2, max = len - 1; i < max; i++) {
		a = points[i].point
		b = points[i + 1].point
		result += average(a, b)
	}

	if (closed) {
		return `M${average(points[0].point, points[1].point)}Q${precise(points[1].point)}${average(
			points[1].point, points[2].point
		)}T${result}${average(points[len - 1].point, points[0].point)}${average(
			points[0].point, points[1].point
		)}Z`
	}

	return `M${precise(points[0].point)}Q${precise(points[1].point)}${average(
		points[1].point, points[2].point
	)}${points.length > 3 ? 'T' : ''}${result}L${precise(points[len - 1].point)}`
}

function getDot(point: VecLike, sw: number) {
	const r = (sw + 1) * 0.5
	return `M ${point.x} ${point.y} m -${r}, 0 a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 -${r * 2},0`
}

function useDefaultColorTheme() {
	return getDefaultColorTheme({ isDarkMode: useIsDarkMode() })
}

////////

let ereaderStreamline = 0.1;
export function setEreaderStreamline(value: number) {
	ereaderStreamline = value;
}

/** Freehand options with minimal smoothing for e-reader raw input fidelity */
function getEreaderFreehandOptions(
	shapeProps: { dash: string; isPen: boolean; isComplete: boolean },
	strokeWidth: number,
	forceComplete: boolean,
): StrokeOptions {
	return {
		size: strokeWidth,
		thinning: 0,
		streamline: ereaderStreamline,
		smoothing: 0.1,
		simulatePressure: false,
		easing: EASINGS.linear,
		last: shapeProps.isComplete || forceComplete,
	}
}

function EreaderDrawShapeSvg({ shape, zoomLevel }: { shape: TLDrawShape; zoomLevel: number }) {
	const theme = useDefaultColorTheme()
	const allPointsFromSegments = getPointsFromSegments(shape.props.segments)
	const showAsComplete = shape.props.isComplete || last(shape.props.segments)?.type === 'straight'

	const sw = (STROKE_SIZES[shape.props.size] + 1) * shape.props.scale
	const options = getEreaderFreehandOptions(shape.props, sw, showAsComplete)

	const strokePoints = getStrokePoints(allPointsFromSegments, options)
	const isDot = strokePoints.length < 2
	const solidStrokePath = isDot
		? getDot(allPointsFromSegments[0], 0)
		: getSvgPathFromStrokePoints(strokePoints, shape.props.isClosed)

	return (
		<>
			{shape.props.isClosed && shape.props.fill && shape.props.fill !== 'none' && !isDot ? (
				<path fill={theme[shape.props.color].semi} d={solidStrokePath} />
			) : null}
			<path
				d={solidStrokePath}
				strokeLinecap="round"
				fill={isDot ? theme[shape.props.color].solid : 'none'}
				stroke={theme[shape.props.color].solid}
				strokeWidth={sw}
				strokeDasharray="none"
				strokeDashoffset="0"
			/>
		</>
	)
}

/**
 * Custom DrawShapeUtil for e-reader devices.
 * Renders strokes with minimal streamline/smoothing so the visual output
 * closely matches the raw pointer input — critical for boox-rapid-draw compatibility.
 */
export class EreaderDrawShapeUtil extends DrawShapeUtil {
	static override type = 'draw' as const

	override component(shape: TLDrawShape) {
		return (
			<SVGContainer id={shape.id}>
				<EreaderDrawShapeSvg shape={shape} zoomLevel={this.editor.getZoomLevel()} />
			</SVGContainer>
		)
	}

	override indicator(shape: TLDrawShape) {
		const allPointsFromSegments = getPointsFromSegments(shape.props.segments)
		const sw = (STROKE_SIZES[shape.props.size] + 1) * shape.props.scale
		const showAsComplete = shape.props.isComplete || last(shape.props.segments)?.type === 'straight'
		const options = getEreaderFreehandOptions(shape.props, sw, showAsComplete)
		const strokePoints = getStrokePoints(allPointsFromSegments, options)
		const solidStrokePath =
			strokePoints.length > 1
				? getSvgPathFromStrokePoints(strokePoints, shape.props.isClosed)
				: getDot(allPointsFromSegments[0], sw)
		return <path d={solidStrokePath} />
	}

	override toSvg(shape: TLDrawShape, ctx: SvgExportContext) {
		const scaleFactor = 1 / shape.props.scale
		return (
			<g transform={`scale(${scaleFactor})`}>
				<EreaderDrawShapeSvg shape={shape} zoomLevel={1} />
			</g>
		)
	}
}

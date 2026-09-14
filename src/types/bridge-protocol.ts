////////
//////// Message schema for the Boox companion-app bridge.
//////// See COMPANION_APP_RESEARCH.md for the design this implements.
////////

export interface BridgeRect {
	left: number,
	top: number,
	width: number,
	height: number,
}

export interface BridgeStyle {
	color: string,
	width: number,
}

// plugin -> companion app: sent when a writing session starts, and again on
// every camera change while active, so the overlay's activation region and
// style stay in sync with the live tldraw viewport.
export interface SetWritingModeMessage {
	type: 'setWritingMode',
	sessionId: string,
	canvasId: string,
	active: boolean,
	rect: BridgeRect,
	style: BridgeStyle,
	// Where the WebView's viewport origin (CSS px) sits on the physical screen — i.e. a real
	// pen PointerEvent's (screenX - clientX, screenY - clientY). Lets the companion app convert
	// its own physical-pixel touch coordinates into the same CSS/viewport-relative space `rect`
	// and every point in StrokePointsMessage are already in. {0,0} means "not yet calibrated"
	// (e.g. desktop/mock testing, where points are already fabricated in the right space).
	screenOrigin: { x: number, y: number },
}

export interface BridgeStrokePoint {
	x: number,
	y: number,
	pressure: number,
	tilt?: number,
	isPen: boolean,
	phase: 'down' | 'move' | 'up',
	t: number,
}

// companion app -> plugin: streamed continuously while the pen is down.
export interface StrokePointsMessage {
	type: 'strokePoints',
	sessionId: string,
	canvasId: string,
	points: BridgeStrokePoint[],
}

// plugin -> companion app: ack once tldraw has rendered the corresponding
// points, so the native overlay knows it can clear its instant preview.
export interface StrokeDrawnMessage {
	type: 'strokeDrawn',
	sessionId: string,
	canvasId: string,
	upToT: number,
}

export type BridgeMessage = SetWritingModeMessage | StrokePointsMessage | StrokeDrawnMessage;

export function isStrokePointsMessage(msg: BridgeMessage): msg is StrokePointsMessage {
	return msg.type === 'strokePoints';
}

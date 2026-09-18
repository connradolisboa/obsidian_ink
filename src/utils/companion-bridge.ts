import { Editor, TLPointerEventInfo } from "@tldraw/tldraw";
import { BridgeMessage, BridgeRect, BridgeStyle, SetWritingModeMessage, StrokeDrawnMessage, StrokePointsMessage, isStrokePointsMessage } from "src/types/bridge-protocol";
import { verbose } from "./log-to-console";

////////
//////// Plugin-side client for the Boox companion-app bridge (see COMPANION_APP_RESEARCH.md).
//////// Connects to a companion app / mock server over a loopback WebSocket, forwards
//////// incoming raw points into tldraw via editor.dispatch(), and acks back once drawn.
////////
//////// Point density from the companion app is expected to exceed what WebView PointerEvents
//////// normally deliver, so incoming 'move' points are decimated here (screen-space distance
//////// threshold) before hitting dispatch() — see the "Added requirement" section of the
//////// research doc for why that matters at scale.
////////

const RECONNECT_DELAY_MS = 2000;
const MIN_MOVE_DISTANCE_PX = 1.5;

export class CompanionBridgeClient {
	// A real companion app can only capture one screen region at a time, so at most one
	// client may hold an active session app-wide — regardless of how many writing embeds
	// happen to be mounted simultaneously (each is its own React root; see COMPANION_APP_RESEARCH.md
	// Phase 4). Starting a new session here preempts — cleanly ends — whichever one held it before.
	private static activeInstance: CompanionBridgeClient | null = null;

	private editor: Editor;
	private port: number;
	private canvasId: string;
	private socket: WebSocket | null = null;
	private sessionId: string | null = null;
	private active = false;
	private lastDispatchedPoint: { x: number, y: number } | null = null;
	private reconnectTimeout: number | undefined;
	// Buffered so it can be (re)sent once the socket is actually open — a fresh
	// WebSocket is still CONNECTING right after `new WebSocket(...)` returns.
	private pendingMode: { rect: BridgeRect, style: BridgeStyle, active: boolean, screenOrigin: { x: number, y: number } } | null = null;
	private readonly pointerId = 9001; // fixed synthetic id, distinct from any real touch/pen pointer

	constructor(editor: Editor, port: number) {
		this.editor = editor;
		this.port = port;
		this.canvasId = `ink-${Math.random().toString(36).slice(2)}`;
	}

	startSession(rect: BridgeRect, style: BridgeStyle, screenOrigin: { x: number, y: number }) {
		if (CompanionBridgeClient.activeInstance && CompanionBridgeClient.activeInstance !== this) {
			verbose('Companion bridge: preempting previous session — a new embed took ownership');
			CompanionBridgeClient.activeInstance.endSession();
		}
		CompanionBridgeClient.activeInstance = this;

		this.active = true;
		this.sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		this.connect();
		this.sendSetWritingMode(rect, style, true, screenOrigin);
	}

	updateRect(rect: BridgeRect, style: BridgeStyle, screenOrigin: { x: number, y: number }) {
		if (!this.active) return;
		this.sendSetWritingMode(rect, style, true, screenOrigin);
	}

	endSession() {
		if (this.sessionId) {
			this.sendSetWritingMode({ left: 0, top: 0, width: 0, height: 0 }, { color: '#000000', width: 1 }, false, { x: 0, y: 0 });
		}
		this.active = false;
		this.sessionId = null;
		this.lastDispatchedPoint = null;
		this.disconnect();

		// Only clear ownership if this instance still holds it — a preempted (already
		// superseded) instance ending later must not clobber the new owner's claim.
		if (CompanionBridgeClient.activeInstance === this) {
			CompanionBridgeClient.activeInstance = null;
		}
	}

	// True only while a session is active *and* the companion app is actually connected.
	// The native pen path is suppressed on this signal, so it has to fail safe: if the companion
	// app isn't running (or dies mid-session), this goes false and normal WebView pen input works.
	isLive(): boolean {
		return this.active && this.socket?.readyState === WebSocket.OPEN;
	}

	////////

	private connect() {
		if (this.socket) return;
		window.clearTimeout(this.reconnectTimeout);
		try {
			this.socket = new WebSocket(`ws://127.0.0.1:${this.port}`);
		} catch (e) {
			this.scheduleReconnect();
			return;
		}
		this.socket.onopen = () => {
			verbose('Companion bridge: connected');
			this.flushPendingMode();
		};
		this.socket.onmessage = (event) => this.handleMessage(event);
		this.socket.onerror = () => verbose('Companion bridge: socket error');
		this.socket.onclose = () => {
			this.socket = null;
			if (this.active) this.scheduleReconnect();
		};
	}

	private disconnect() {
		window.clearTimeout(this.reconnectTimeout);
		this.socket?.close();
		this.socket = null;
	}

	private scheduleReconnect() {
		window.clearTimeout(this.reconnectTimeout);
		this.reconnectTimeout = window.setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
	}

	private sendSetWritingMode(rect: BridgeRect, style: BridgeStyle, active: boolean, screenOrigin: { x: number, y: number }) {
		if (!this.sessionId) return;
		this.pendingMode = { rect, style, active, screenOrigin };
		this.flushPendingMode();
	}

	private flushPendingMode() {
		if (!this.pendingMode || !this.sessionId || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
		const msg: SetWritingModeMessage = {
			type: 'setWritingMode',
			sessionId: this.sessionId,
			canvasId: this.canvasId,
			devicePixelRatio: window.devicePixelRatio,
			...this.pendingMode,
		};
		this.socket.send(JSON.stringify(msg));
	}

	private handleMessage(event: MessageEvent) {
		let msg: BridgeMessage;
		try {
			msg = JSON.parse(event.data);
		} catch {
			return;
		}
		if (!isStrokePointsMessage(msg)) return;
		if (!this.sessionId || msg.sessionId !== this.sessionId) return; // stale/foreign session
		this.dispatchPoints(msg);
	}

	private dispatchPoints(msg: StrokePointsMessage) {
		let lastT = 0;

		for (const p of msg.points) {
			lastT = p.t;

			if (p.phase === 'move' && this.lastDispatchedPoint) {
				const dx = p.x - this.lastDispatchedPoint.x;
				const dy = p.y - this.lastDispatchedPoint.y;
				if ((dx * dx + dy * dy) < MIN_MOVE_DISTANCE_PX * MIN_MOVE_DISTANCE_PX) continue;
			}

			const name = p.phase === 'down' ? 'pointer_down' : p.phase === 'up' ? 'pointer_up' : 'pointer_move';
			const info: TLPointerEventInfo = {
				type: 'pointer',
				name,
				point: { x: p.x, y: p.y, z: p.pressure },
				pointerId: this.pointerId,
				button: 0,
				isPen: true,
				shiftKey: false,
				altKey: false,
				ctrlKey: false,
				target: 'canvas',
			};
			this.editor.dispatch(info);

			this.lastDispatchedPoint = p.phase === 'up' ? null : { x: p.x, y: p.y };
		}

		if (this.sessionId && this.socket && this.socket.readyState === WebSocket.OPEN) {
			const ack: StrokeDrawnMessage = {
				type: 'strokeDrawn',
				sessionId: this.sessionId,
				canvasId: this.canvasId,
				upToT: lastT,
			};
			this.socket.send(JSON.stringify(ack));
		}
	}
}

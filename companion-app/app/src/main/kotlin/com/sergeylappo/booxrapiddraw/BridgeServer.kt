package com.sergeylappo.booxrapiddraw

import android.util.Log
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetSocketAddress

private const val TAG = "BridgeServer"

// Mirrors SetWritingModeMessage in src/types/bridge-protocol.ts (the Obsidian plugin repo).
data class WritingModeState(
    val sessionId: String,
    val canvasId: String,
    val active: Boolean,
    val rectLeft: Double,
    val rectTop: Double,
    val rectWidth: Double,
    val rectHeight: Double,
    // Where the WebView viewport's (0,0) sits on the physical screen, in CSS px — see
    // "Coordinate calibration" in /COMPANION_APP_RESEARCH.md. {0,0} until the plugin calibrates.
    val screenOriginX: Double,
    val screenOriginY: Double,
)

interface BridgeServerListener {
    fun onWritingModeChanged(state: WritingModeState)
}

/**
 * Embedded loopback WebSocket server for the Obsidian-plugin companion bridge.
 * See /COMPANION_APP_RESEARCH.md in the parent repo for the message schema this speaks.
 *
 * Bound to 127.0.0.1 only — never reachable off-device. Broadcasts strokePoints to whichever
 * client is connected; in practice that's exactly one (the Obsidian plugin), which already
 * ignores anything not matching its own sessionId, so a stray second client is harmless.
 */
class BridgeServer(port: Int, private val listener: BridgeServerListener) :
    WebSocketServer(InetSocketAddress("127.0.0.1", port)) {

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
        Log.i(TAG, "Plugin connected: ${conn.remoteSocketAddress}")
    }

    override fun onClose(conn: WebSocket, code: Int, reason: String?, remote: Boolean) {
        Log.i(TAG, "Plugin disconnected (code=$code reason=$reason)")
    }

    override fun onMessage(conn: WebSocket, message: String) {
        try {
            val json = JSONObject(message)
            if (json.optString("type") != "setWritingMode") return

            val rect = json.getJSONObject("rect")
            val origin = json.optJSONObject("screenOrigin")
            listener.onWritingModeChanged(
                WritingModeState(
                    sessionId = json.getString("sessionId"),
                    canvasId = json.getString("canvasId"),
                    active = json.getBoolean("active"),
                    rectLeft = rect.getDouble("left"),
                    rectTop = rect.getDouble("top"),
                    rectWidth = rect.getDouble("width"),
                    rectHeight = rect.getDouble("height"),
                    screenOriginX = origin?.optDouble("x", 0.0) ?: 0.0,
                    screenOriginY = origin?.optDouble("y", 0.0) ?: 0.0,
                )
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse bridge message: $message", e)
        }
    }

    override fun onError(conn: WebSocket?, ex: Exception) {
        Log.w(TAG, "Bridge server error", ex)
    }

    override fun onStart() {
        Log.i(TAG, "Bridge server listening on 127.0.0.1:$port")
    }

    /** Sends one stroke point (already converted to CSS/viewport-relative coordinates). */
    fun sendStrokePoint(
        sessionId: String,
        canvasId: String,
        x: Double,
        y: Double,
        pressure: Double,
        phase: String,
        t: Long,
    ) {
        val point = JSONObject().apply {
            put("x", x)
            put("y", y)
            put("pressure", pressure)
            put("tilt", 0)
            put("isPen", true)
            put("phase", phase)
            put("t", t)
        }
        val msg = JSONObject().apply {
            put("type", "strokePoints")
            put("sessionId", sessionId)
            put("canvasId", canvasId)
            put("points", JSONArray().put(point))
        }
        val text = msg.toString()
        for (conn in connections) {
            if (conn.isOpen) conn.send(text)
        }
    }
}

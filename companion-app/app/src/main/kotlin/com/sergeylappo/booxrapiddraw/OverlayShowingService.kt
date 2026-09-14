package com.sergeylappo.booxrapiddraw

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.view.Gravity
import android.view.MotionEvent
import android.view.SurfaceView
import android.view.View
import android.view.View.OnLayoutChangeListener
import android.view.WindowManager
import android.view.WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
import android.view.WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
import android.view.WindowManager.LayoutParams.MATCH_PARENT
import android.view.WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.onyx.android.sdk.data.note.TouchPoint
import com.onyx.android.sdk.pen.RawInputCallback
import com.onyx.android.sdk.pen.TouchHelper
import com.onyx.android.sdk.pen.data.TouchPointList
import com.sergeylappo.booxrapiddraw.utils.BridgePrefs

private const val CHANNEL_ID = "rapid_draw_channel_overlay_01"
private const val STROKE_WIDTH = 3.0f

private const val BRIDGE_PORT = 8765

class OverlayShowingService : Service(), BridgeServerListener {
    private val paint = Paint()

    private lateinit var touchHelper: TouchHelper
    private lateinit var wm: WindowManager
    private lateinit var overlayPaintingView: SurfaceView
    private lateinit var fullScreenBounds: Rect

    // Obsidian-plugin companion bridge. See /COMPANION_APP_RESEARCH.md in the parent repo.
    private var bridgeServer: BridgeServer? = null
    private var writingMode: WritingModeState? = null

    override fun onBind(intent: Intent) = null

    override fun onCreate() {
        super.onCreate()

        createForegroundNotification()

        wm = getSystemService(WINDOW_SERVICE) as WindowManager

        createOverlayPaintingView()

        initPaint()
        initSurfaceView()

        bridgeServer = BridgeServer(BRIDGE_PORT, this).also { it.start() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") {
            Toast.makeText(this, "Terminating Rapid Draw Service...", Toast.LENGTH_SHORT).show()
            stopSelf()
            return START_NOT_STICKY // Prevents service from being recreated
        }

        if (intent?.action == "TOGGLE_OBSIDIAN_ONLY") {
            val newValue = !BridgePrefs.isObsidianOnlyMode(this)
            BridgePrefs.setObsidianOnlyMode(this, newValue)
            applyCaptureState()
            createForegroundNotification() // rebuild so the action label reflects the new state
            return START_STICKY
        }

        Toast.makeText(this, "Starting Rapid Draw Service", Toast.LENGTH_SHORT).show()
        return START_STICKY // Service will be recreated if killed
    }

    private fun createForegroundNotification() {
        val notificationManager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        notificationManager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Boox Rapid draw overlay service",
                NotificationManager.IMPORTANCE_HIGH
            )
        )

        // add notification intent to finish the service
        val pendingIntent = PendingIntent.getService(
            this,
            0,
            Intent(this, OverlayShowingService::class.java).apply { action = "STOP" },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Obsidian-plugin companion bridge: lets the general-purpose (works in any app)
        // behavior be switched to Obsidian-writing-embed-only, and back, without a rebuild.
        // See /COMPANION_APP_RESEARCH.md in the parent repo.
        val obsidianOnly = BridgePrefs.isObsidianOnlyMode(this)
        val toggleObsidianOnlyIntent = PendingIntent.getService(
            this,
            1,
            Intent(this, OverlayShowingService::class.java).apply { action = "TOGGLE_OBSIDIAN_ONLY" },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val toggleLabel = if (obsidianOnly) "Obsidian-only: ON (tap for all apps)" else "Obsidian-only: OFF (tap to restrict)"

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.overlay_service_notification_content_title))
            .setContentText(getString(R.string.overlay_service_notification_content))
            .setSmallIcon(R.drawable.rapid_draw)
            .addAction(NotificationCompat.Action.Builder(null, "Stop", pendingIntent).build())
            .addAction(NotificationCompat.Action.Builder(null, toggleLabel, toggleObsidianOnlyIntent).build())
            .build()

        //noinspection InlinedApi (Seems to work, IDK why, maybe older Android versions might not support this)
        ServiceCompat.startForeground(this, 1, notification, FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    }

    private fun createOverlayPaintingView() {
        overlayPaintingView = SurfaceView(this)
        overlayPaintingView.setZOrderOnTop(true)
        overlayPaintingView.holder.setFormat(PixelFormat.TRANSPARENT)
        overlayPaintingView.alpha = 1.0f

        val topLeftParams = WindowManager.LayoutParams(
            MATCH_PARENT,
            MATCH_PARENT,
            TYPE_APPLICATION_OVERLAY,
            FLAG_NOT_FOCUSABLE or FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSPARENT
        )
        topLeftParams.alpha = 0.2f
        topLeftParams.gravity = Gravity.START or Gravity.TOP

        //        TODO this is duplicated
        //        TODO actual bottom place is calculated incorrectly due to the status bar...
        val displayMetrics = resources.displayMetrics
        val bounds = Rect(0, 0, displayMetrics.widthPixels, displayMetrics.heightPixels)
        fullScreenBounds = bounds

        topLeftParams.x = bounds.left
        topLeftParams.y = bounds.top

        wm.addView(overlayPaintingView, topLeftParams)
    }

    private fun initPaint() {
        paint.isAntiAlias = true
        paint.style = Paint.Style.STROKE
        paint.color = Color.BLACK
        paint.strokeWidth = STROKE_WIDTH
    }

    //    TODO fix suppress
    @SuppressLint("ClickableViewAccessibility")
    private fun initSurfaceView() {
        touchHelper = TouchHelper.create(overlayPaintingView, 2, callback)
        touchHelper.setPenUpRefreshTimeMs(1000)
        overlayPaintingView.addOnLayoutChangeListener(object : OnLayoutChangeListener {
            override fun onLayoutChange(
                v: View,
                left: Int,
                top: Int,
                right: Int,
                bottom: Int,
                oldLeft: Int,
                oldTop: Int,
                oldRight: Int,
                oldBottom: Int
            ) {
                val bounds = Rect(0, 0, right, bottom)
                overlayPaintingView.getLocalVisibleRect(bounds)
                touchHelper.setStrokeColor(Color.BLACK)
                touchHelper.setStrokeStyle(TouchHelper.STROKE_STYLE_PENCIL)
                touchHelper.openRawDrawing()
                touchHelper.setStrokeWidth(STROKE_WIDTH).setLimitRect(bounds, listOf())
                touchHelper.setRawInputReaderEnable(!touchHelper.isRawDrawingInputEnabled)
                applyCaptureState() // applies Obsidian-only-mode's initial disabled state, if on
                overlayPaintingView.addOnLayoutChangeListener(this)
            }
        })

        overlayPaintingView.setOnTouchListener { _: View?, _: MotionEvent? -> true }
    }

    override fun onDestroy() {
        super.onDestroy()
        wm.removeViewImmediate(overlayPaintingView)
        touchHelper.closeRawDrawing()
        bridgeServer?.stop()
        bridgeServer = null
    }

    ////////
    //////// Obsidian-plugin companion bridge. See /COMPANION_APP_RESEARCH.md in the parent repo.
    ////////

    override fun onWritingModeChanged(state: WritingModeState) {
        writingMode = if (state.active) state else null
        applyCaptureState()
    }

    // Scope raw capture to just the writing embed's region while a session is active,
    // restoring full-screen capture when it isn't. The coordinate conversion here is the
    // same one used for outgoing points, just inverted (CSS px -> physical px) and without
    // subtracting screenOrigin, since setLimitRect wants physical-screen-absolute
    // coordinates, same space touchPoint.x/y already are.
    //
    // Whether an inactive session actually *disables* capture (vs. just widening back to
    // full-screen) is opt-in via BridgePrefs — default off preserves the app's original,
    // general-purpose behavior. This is the DEV build (see build.gradle.kts
    // applicationIdSuffix) specifically so this can be tested without risking the stable
    // install. See /COMPANION_APP_RESEARCH.md for the two prior attempts at this.
    private fun applyCaptureState() {
        if (!::touchHelper.isInitialized) return
        val density = resources.displayMetrics.density.toDouble()
        val mode = writingMode

        if (mode != null) {
            val left = ((mode.screenOriginX + mode.rectLeft) * density).toInt()
            val top = ((mode.screenOriginY + mode.rectTop) * density).toInt()
            val right = left + (mode.rectWidth * density).toInt()
            val bottom = top + (mode.rectHeight * density).toInt()
            touchHelper.setLimitRect(Rect(left, top, right, bottom), listOf())
            setRawCaptureEnabled(true)
        } else {
            touchHelper.setLimitRect(fullScreenBounds, listOf())
            setRawCaptureEnabled(!BridgePrefs.isObsidianOnlyMode(this))
        }
    }

    // Mirrors the reader's last-applied enabled state so setRawInputReaderEnable is only
    // called on an actual transition, not on every onWritingModeChanged (which fires on
    // every camera move and every pen-calibration event — i.e. repeatedly during a single
    // active session). Calling it redundantly was a real bug found on 2026-09-14 — see
    // /COMPANION_APP_RESEARCH.md — though even fixing it didn't fully resolve that session's
    // testing, which is exactly why this now lives in an isolated dev-only install.
    private var rawCaptureEnabled = true

    private fun setRawCaptureEnabled(enabled: Boolean) {
        if (rawCaptureEnabled == enabled) return
        rawCaptureEnabled = enabled
        touchHelper.setRawInputReaderEnable(enabled)
    }

    private fun forwardPointToBridge(touchPoint: TouchPoint?, phase: String) {
        val mode = writingMode ?: return
        val point = touchPoint ?: return
        val density = resources.displayMetrics.density.toDouble()
        val cssX = point.x.toDouble() / density - mode.screenOriginX
        val cssY = point.y.toDouble() / density - mode.screenOriginY
        bridgeServer?.sendStrokePoint(
            sessionId = mode.sessionId,
            canvasId = mode.canvasId,
            x = cssX,
            y = cssY,
            pressure = point.pressure.toDouble(),
            phase = phase,
            t = point.timestamp.toLong(),
        )
    }

    ////////

    private val callback: RawInputCallback = object : RawInputCallback() {
        override fun onBeginRawDrawing(b: Boolean, touchPoint: TouchPoint?) {
            forwardPointToBridge(touchPoint, "down")
        }

        override fun onEndRawDrawing(b: Boolean, touchPoint: TouchPoint?) {
            forwardPointToBridge(touchPoint, "up")
        }

        override fun onRawDrawingTouchPointMoveReceived(touchPoint: TouchPoint?) {
            forwardPointToBridge(touchPoint, "move")
        }

        override fun onPenActive(point: TouchPoint?) {
            touchHelper.setRawDrawingEnabled(true)
        }

        override fun onRawDrawingTouchPointListReceived(touchPointList: TouchPointList) {}

        override fun onBeginRawErasing(b: Boolean, touchPoint: TouchPoint?) {}

        override fun onEndRawErasing(b: Boolean, touchPoint: TouchPoint?) {}

        override fun onRawErasingTouchPointMoveReceived(touchPoint: TouchPoint?) {}

        override fun onRawErasingTouchPointListReceived(touchPointList: TouchPointList?) {}

        override fun onPenUpRefresh(refreshRect: RectF?) {
            touchHelper.isRawDrawingRenderEnabled = false
            super.onPenUpRefresh(refreshRect)
        }
    }
}

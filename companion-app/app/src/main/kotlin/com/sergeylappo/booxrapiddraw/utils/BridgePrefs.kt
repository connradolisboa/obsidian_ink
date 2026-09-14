package com.sergeylappo.booxrapiddraw.utils

import android.content.Context

private const val PREFS_NAME = "boox_rapid_draw_prefs"
private const val KEY_OBSIDIAN_ONLY = "obsidian_only_mode"

/**
 * Whether raw stylus capture should be restricted to the active Obsidian writing embed
 * (via the companion bridge) instead of working normally in every app. Off by default —
 * preserves the app's original, general-purpose behavior. Toggled from the foreground
 * service notification in OverlayShowingService.
 */
object BridgePrefs {
    fun isObsidianOnlyMode(context: Context): Boolean =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getBoolean(KEY_OBSIDIAN_ONLY, false)

    fun setObsidianOnlyMode(context: Context, value: Boolean) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_OBSIDIAN_ONLY, value)
            .apply()
    }
}

# Onyx Boox Optimization — Research & Implementation Notes

## Goal
Make obsidian_ink write smoothly on Onyx Boox e-ink devices with a stylus (USI pen), specifically with [boox-rapid-draw](https://github.com/sergeylappo/boox-rapid-draw) active.

---

## How boox-rapid-draw Works

boox-rapid-draw is a **system-level transparent overlay** that uses the Onyx native SDK (`TouchHelper` + `RawInputCallback`) to capture raw stylus input at the hardware level and render strokes instantly on a `SurfaceView` above every app. It is configured with `FLAG_NOT_TOUCHABLE` so it doesn't intercept touch events — the underlying app still receives all pointer events normally.

**Why it works with Excalidraw but not obsidian_ink:**
The overlay renders a simple, raw stroke immediately. The underlying app *also* renders the stroke through its own pipeline. With Excalidraw, the two renderings are close enough to look fine. With obsidian_ink (tldraw), the "perfect-freehand" algorithm applies aggressive smoothing and path simplification — at normal writing speed this causes the final tldraw stroke to look very different from the overlay stroke, making letters unreadable.

---

## Onyx SDK Constraints

The official [Onyx Android SDK](https://github.com/onyx-intl/OnyxAndroidDemo) exposes:
- `onyxsdk-pen` — stylus input, pressure, `TouchHelper`/`RawInputCallback`
- `onyxsdk-scribble` — drawing on views
- `EpdController` / `EpdDeviceManager` — e-ink refresh modes (DU, GC, REGAL, ANIMATION, etc.)

**NONE of these are accessible from JavaScript/WebView.** There is no JS bridge.

The only WebView-facing Onyx API is `EpdController.setWebViewContrastOptimize(WebView, boolean)` — but this is set at the Android layer, not from JavaScript.

**All plugin improvements must use standard Web APIs available in the Android WebView (Chromium-based).**

### Web APIs that DO work on Boox WebView
- `PointerEvent.pointerType` — `"pen"` vs `"touch"` vs `"mouse"` — key for palm rejection
- `PointerEvent.pressure` — EMR stylus reports real pressure (0.0–1.0)
- `PointerEvent.tiltX/tiltY` — stylus tilt data
- CSS `touch-action` property — controls browser gesture handling
- `navigator.userAgent` — can detect Boox device model (contains "BOOX" or "Onyx")

---

## Root Cause in obsidian_ink

### Dead settings
Two settings exist in `src/types/plugin-settings.ts` that are **defined but never connected to anything**:

| Setting | Default | Status |
|---|---|---|
| `writingDynamicStrokeThickness` | `true` | Dead — never read or applied |
| `writingSmoothing` | `false` | Dead — never read or applied |

The developer had commented-out code in `src/utils/tldraw-helpers.ts` (`simplifyWritingLines()`) that showed the intent to set `dash: 'solid'` on tldraw draw shapes — but it was never shipped.

### tldraw stroke rendering modes
tldraw's draw tool has two rendering modes controlled by the `dash` style:
- `dash: 'draw'` (default) — uses "perfect-freehand" library, variable width, aggressive path smoothing. Conflicts with boox-rapid-draw overlay.
- `dash: 'solid'` — simple constant-width polyline, minimal smoothing. Matches boox-rapid-draw overlay visually.

### Touch/pointer handling gap
`preventTldrawCanvasesCausingObsidianGestures()` in `src/utils/tldraw-helpers.ts` only blocks `touchmove` from propagating — it doesn't filter out `touch` pointer events from reaching tldraw's drawing pipeline. On Boox, palm/finger contact creates unwanted marks.

---

## What Was Implemented

### 1. `src/utils/isEreader.ts` (new file)
Detects Boox/e-reader devices via `navigator.userAgent`. Used to auto-apply optimizations without user configuration.

### 2. Core fix: Wire `writingDynamicStrokeThickness` to tldraw
In both `tldraw-writing-editor.tsx` and `tldraw-drawing-editor.tsx`, on editor mount:
```typescript
const useSimpleStrokes = !plugin.settings.writingDynamicStrokeThickness || isEreader();
if (useSimpleStrokes) {
    editor.setStyleForNextShapes(DefaultDashStyle, 'solid');
}
```
On Boox: auto-applies `solid` regardless of setting. On other devices: follows `writingDynamicStrokeThickness` setting.

### 3. Palm rejection
Updated `preventTldrawCanvasesCausingObsidianGestures()` to accept `{ stylusOnly: boolean }`. When enabled, adds capture-phase `pointerdown`/`pointermove` listeners that block events where `pointerType === "touch"` before tldraw sees them. Auto-enabled on Boox, or via the new "Stylus only input" setting.

### 4. CSS animation disable
Added `.ddc_ink_ereader-mode` CSS class applied to the editor wrapper on Boox devices. SCSS rules in both editor stylesheets kill `transition` and `animation` on the tldraw container — reduces e-ink ghosting.

### 5. New `stylusOnlyInput` setting
Boolean toggle in plugin settings (default: `false`). Exposed in the Writing settings section alongside the now-functional "Dynamic stroke thickness" toggle.

---

## What This Does NOT Fix

- **Base SVG lag without boox-rapid-draw**: tldraw's SVG rendering degrades architecturally with stroke count. The existing stash system mitigates this. The plugin author plans a Canvas-based renderer long-term. Users should lower `writingStrokeLimit` in settings (default 200 — try 50–100 on Boox).
- **boox-rapid-draw focus-loss bug**: After switching to Boox keyboard and back, boox-rapid-draw loses its pen context and requires a manual restart. This is a known issue in that app ([#30](https://github.com/sergeylappo/boox-rapid-draw/issues/30)).
- **EpdController refresh modes**: Native Android only — not accessible from WebView.

---

## Future Improvement Ideas

- **Lower stroke limit auto-detection**: Auto-set `writingStrokeLimit` lower on Boox to reduce SVG element count.
- **Supernote / reMarkable support**: Extend `isEreader()` to detect other e-ink devices.
- **Pressure curve tuning**: tldraw consumes `PointerEvent.pressure` natively. A custom sqrt pressure curve (like Notable's fountain pen mode) could improve pen feel on e-ink.
- **Canvas renderer**: The author's planned long-term fix — would eliminate the SVG lag entirely.

---

## Related Repos
- [boox-rapid-draw](https://github.com/sergeylappo/boox-rapid-draw) — system overlay for instant ink on Boox
- [jshph/notable](https://github.com/jshph/notable) — native Android Boox→Obsidian handwriting app (reference for Boox SDK usage)
- [Ethran/notable](https://github.com/Ethran/notable) — upstream of jshph/notable
- [onyx-intl/OnyxAndroidDemo](https://github.com/onyx-intl/OnyxAndroidDemo) — official Onyx SDK documentation and demos

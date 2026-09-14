# Boox Companion App — Research & Design Notes

## Goal
Build a realtime "overlay bridge" for Onyx Boox devices: a companion Android app that captures stylus input at hardware speed (like [boox-rapid-draw](https://github.com/sergeylappo/boox-rapid-draw)) and feeds it into this plugin's tldraw editor as the single source of truth, eliminating the overlay/tldraw render mismatch documented in [BOOX_OPTIMIZATION.md](BOOX_OPTIMIZATION.md).

**Core design principle:** the companion app is a low-latency *input source*, not a second stroke-rendering pipeline. It shows an instant raw-line preview purely to mask e-ink refresh lag, forwards every raw point to the plugin in real time, and tldraw's existing draw-tool pipeline (perfect-freehand, styling, palm rejection) remains the only thing that produces the real shape. This avoids re-implementing tldraw's stroke logic in Kotlin and staying in lockstep with its internal format on every plugin update.

---

## Research summary

### 1. OpenInkBridge — correction to the original premise
Initial assumption was that OpenInkBridge works like boox-rapid-draw: a standalone overlay that can sit on top of *any* app, including one we don't control (Obsidian). **This is wrong.**

- OpenInkBridge (`GoVed/OpenInkBridge`, MIT-adjacent, Rust core + Android/Web/Linux bindings, created July 2026 — ~2 months old, protocol at v0.2, still marked experimental for reMarkable/Kobo backends) is a **library you embed into an app you control**. Its Android SDK provides `OpenInkBridgeView` / `OpenInkBridgeWebView` — components you add to your own app's layout, or your own WebView subclass. It is not a system-wide overlay service and cannot instrument Obsidian's existing, closed-source Android app.
- Its Boox backend does exist and works the way `BOOX_OPTIMIZATION.md` describes: it compiles against `com.onyx.android.sdk:onyxsdk-pen:1.5.4` as a `compileOnly` dependency (same Onyx `TouchHelper`/`RawInputCallback` APIs already researched in this repo), so BOOX apps opt in to the vendor runtime at build time.
- **Conclusion: we cannot literally reuse OpenInkBridge's Android SDK for this project**, since it requires embedding into an app we don't own. What *is* reusable is its **protocol design (OIP)** — a sensible, already-specified JSON schema for exactly this kind of bridge — and its web package's mental model (a JS-facing SDK that receives finished stroke data and viewport-driven activation).

### 2. OpenInk Protocol (OIP) v0.2 — worth borrowing, not adopting wholesale
Two profiles are defined:
- **Profile A (JSON bridge)** — the relevant one for us. Uses `postMessage`/`WebMessagePort`/Unix Domain Sockets as its official transports (we'll substitute a loopback WebSocket — see §4). Message shapes worth copying almost verbatim:
  - `setWritingMode` (host → native): `{ color, width, stylusOnly, rect: {left, top, width, height} }` — this is exactly the "tell the overlay where to activate" message we need, and maps directly onto tldraw's `getViewportScreenBounds()`.
  - `strokeFinished` (native → host): `{ sessionId, canvasId, payload: { points: [{x, y, pressure, tilt, timestamp}, ...] } }`.
  - `strokeDrawn` (host → native): ack that lets the native overlay clear its temp preview once the real shape has rendered — this is the exact handoff mechanic our design needs.
  - Session/canvas identity via `sessionId`/`canvasId` strings, no formal handshake beyond that.
- **Profile B (binary streaming)** — a 32-byte fixed frame (magic, version, packet type, sequence, timestamp, fixed-point x/y, pressure, tilt, routing flags, CRC-8) over IPC pipes/evdev — built for Linux, not relevant to an Android-to-WebView bridge.

**Recommendation:** design our own bridge message schema modeled closely on OIP Profile A (so we're compatible with an emerging convention and could adopt a future off-the-shelf implementation later), but carry it over a plain loopback WebSocket rather than WebMessagePort/UDS, since that's the only transport a plugin's WebView JS can actually reach (see §4).

### 3. boox-rapid-draw — the actual reusable base
- MIT licensed, mature relative to OpenInkBridge (269 stars, active — last push within the past month), single Android app module.
- Confirmed pattern: `SYSTEM_ALERT_WINDOW` ("Allow display over other apps") permission, `TouchHelper`/`RawInputCallback` raw Onyx input, transparent `SurfaceView` overlay drawn with `FLAG_NOT_TOUCHABLE` so it never intercepts events meant for the app underneath.
- **This is the actual architecture we need to extend**, not OpenInkBridge — it already solves the hard, device-specific part (system-wide overlay + Onyx SDK integration + not stealing touch focus). The missing piece is purely an IPC/bridge output: instead of (or in addition to) drawing locally, emit each raw point over a local WebSocket using an OIP-Profile-A-style JSON message.
- **Known risk to weigh:** [issue #30](https://github.com/sergeylappo/boox-rapid-draw/issues/30) reports palm rejection breaking *system-wide, across unrelated apps* (Notes, OneNote) after install, requiring a device restart to clear. This is a real signal about blast radius — a bug in this class of overlay app doesn't stay contained to Obsidian. Worth explicit testing and a very visible kill-switch/toggle in the companion app if we ship this.
- Fork-and-extend from boox-rapid-draw is the pragmatic path unless there's a strong reason to build the overlay from scratch.

### 4. Transport: loopback WebSocket — de-risked
This was flagged as the single biggest unknown (can Obsidian's mobile WebView even open a socket to `127.0.0.1`, given Android 9+ blocks cleartext by default and Obsidian's own manifest/network-security-config isn't under our control).

Found strong circumstantial evidence it works:
- **Local Sync** (Obsidian community plugin) does peer-to-peer **WebSocket** sync between devices over LAN, on Android, from inside a plugin.
- **Self-hosted LiveSync** syncs over WebRTC/CouchDB across iOS and Android from inside a plugin.

Both prove outbound socket connections (to LAN peers, not just remote HTTPS hosts) are reachable from Obsidian's mobile plugin environment today. `127.0.0.1` is generally cleartext-exempt by default Android network security policy regardless of the host app's config (this became the explicit platform default from Android 17, and was already the common implicit behavior earlier via the loopback exemption in most stock configs).

**CONFIRMED on-device (2026-09-14):** ran the actual spike — a Python `websockets` echo server in Termux on the Boox device, and a throwaway Obsidian command (`src/commands/test-companion-bridge-connection.ts`) connecting to `ws://127.0.0.1:8765` from inside the mobile plugin. Result: **success**, round-trip message echoed back and shown in an Obsidian Notice. The transport risk is closed — nothing about this plan is blocked by WebView networking restrictions. Spike code removed from the plugin now that it's served its purpose.

### 5. tldraw injection API — confirmed present in the vendored version
Checked `node_modules/@tldraw/editor` directly (this repo's actual vendored version, not tldraw's docs in the abstract):
- `editor.dispatch(info: TLEventInfo): this` is public API, explicitly documented for synthetic event injection (`editor.dispatch(myPointerEvent)` is the docstring example).
- `TLPointerEventInfo` shape: `{ type: 'pointer', name: 'pointer_down'|'pointer_move'|'pointer_up'|..., point: VecLike, pointerId, button, isPen, shiftKey, altKey, ctrlKey, target: 'canvas' }`.
- `VecModel` (what `point` accepts) is `{ x: number, y: number, z?: number }` — tldraw's standing convention is **`z` carries pressure** for freehand/draw shapes. So pressure from the companion app maps straight through.
- Coordinate mapping: `editor.getCamera()`, `editor.getViewportScreenBounds()`, `editor.screenToPage()`, `editor.pageToScreen()` are all public and exactly what's needed to (a) tell the companion app the screen-space rect + zoom of the active writing embed, and (b) convert companion-app screen coordinates into tldraw page space if we choose to pre-convert on the JS side instead of feeding raw screen points through `dispatch`.
- No existing `dispatch(` usage anywhere in `src/` — this is net-new plugin code, no prior art in this codebase to build on or conflict with.

This confirms the core design principle in §0 is technically achievable with public, stable-looking tldraw API — not a hack against internals.

---

## Revised architecture

```
┌─────────────────────────────┐        loopback WebSocket         ┌──────────────────────────────┐
│  Companion Android app       │  ───────────────────────────────▶ │  Plugin (inside Obsidian's    │
│  (fork of boox-rapid-draw)   │   raw points: {x,y,pressure,      │  mobile WebView)               │
│                               │   tilt,timestamp}                 │                                │
│  - SYSTEM_ALERT_WINDOW        │ ◀───────────────────────────────  │  - WS client                  │
│    transparent overlay        │   setWritingMode-style msg:       │  - on writing-session start:  │
│  - Onyx TouchHelper /          │   {rect, color, width,            │    send active editor bounds, │
│    RawInputCallback            │    sessionId, canvasId}           │    camera, style               │
│  - instant local preview       │                                    │  - on point batch: editor     │
│    stroke (masks e-ink lag)    │   strokeDrawn ack (native ─────▶   │    .dispatch(pointer_move...) │
│  - foreground service for      │   overlay clears preview once      │  - tldraw's own draw tool     │
│    Boox task-killer resilience │   tldraw has caught up)            │    does all the real rendering│
└─────────────────────────────┘                                     └──────────────────────────────┘
```

Message schema (modeled on OIP Profile A, carried as JSON text frames over WS):

```jsonc
// plugin → companion app, sent when an ink embed enters writing mode
// and again on every camera change (pan/zoom) while active
{
  "type": "setWritingMode",
  "sessionId": "…", "canvasId": "…",
  "active": true,
  "rect": { "left": 0, "top": 0, "width": 0, "height": 0 }, // editor.getViewportScreenBounds()
  "style": { "color": "#000000", "width": 2 }
}

// companion app → plugin, streamed continuously while the pen is down
{
  "type": "strokePoints",
  "sessionId": "…", "canvasId": "…",
  "points": [ { "x": 0, "y": 0, "pressure": 0, "tilt": 0, "isPen": true, "phase": "down|move|up", "t": 0 } ]
}

// plugin → companion app, once tldraw has rendered the corresponding points
{ "type": "strokeDrawn", "sessionId": "…", "canvasId": "…", "upToT": 0 }
```

---

## Risks & unknowns, updated

| Risk | Status |
|---|---|
| Can Obsidian mobile WebView open a loopback WebSocket? | **Confirmed working**, tested on-device 2026-09-14. Closed. |
| Can we reuse OpenInkBridge's Android SDK directly? | **No** — it's embed-only, not a third-party overlay. Only its protocol ideas are reusable. |
| Overlay-over-any-app pattern proven feasible on Boox? | **Yes** — boox-rapid-draw already does this in production, 269 stars, MIT. |
| Focus/lifecycle tracking (which embed is active, pause on scroll/pane-switch/background) | Unresolved — needs its own design pass; plugin-side `setWritingMode{active:false}` on blur is straightforward, but multi-pane / multi-embed session identity needs care. |
| Boox background-kill behavior | Needs a foreground service in the companion app; boox-rapid-draw's existing "freeze" workaround guidance in its README is a relevant precedent. |
| Blast radius of overlay bugs | **Elevated** — issue #30 shows a broken overlay can degrade palm rejection system-wide, not just inside Obsidian. Needs an obvious kill switch and real device testing before relying on it daily. |
| tldraw API stability for `dispatch`/`getCamera`/etc. | Public, documented API in the vendored version — reasonably stable, but pin to the currently vendored tldraw version and re-check on any tldraw bump. |
| Licensing | boox-rapid-draw is MIT — forking/extending is clean. This plugin's own upstream (`daledesilva/obsidian_ink`) is CC BY-NC-ND, personal-use-only per this fork's README — irrelevant to the companion app itself (separate codebase/license), but keep the companion app personal-use too unless that's revisited. |

---

## End-to-end confirmed on real hardware (2026-09-14)

Full pipeline working on the actual Boox (Onyx Go 10.3), not just against the mock server: real stylus input → `OverlayShowingService.kt`'s raw callbacks → `BridgeServer.kt` → loopback WebSocket → `companion-bridge.ts` → `editor.dispatch()` → real tldraw strokes, landing in the correct place.

One real bug hit and fixed along the way: the very first `setWritingMode` goes out before any real pen touch has happened, so it necessarily carries an uncalibrated `screenOrigin: {0,0}`. The first real pen-down *did* compute the correct offset locally, but nothing was resending it — so the companion app kept using `{0,0}` for the entire session, producing consistently-offset strokes ("writes, but lands in the wrong place"). Fixed by having the calibration handler immediately call `updateRect()` with the corrected origin instead of just storing it locally. Confirmed fixed on-device.

**Still open:** the very first stroke of a fresh session has an inherent small race (calibration and the first down-point are both triggered by the same physical touch, asynchronously) — not yet confirmed whether this is visible in practice or negligible.

**Confirmed 2026-09-14: the original complaint (flash/pop, deformed text at overlay→tldraw handoff) is gone.** There's still a small, expected gap between writing and the real tldraw content appearing (inherent to the round-trip), but not the mismatch/distortion.

## Scope raw capture to writing embeds only (2026-09-14, unverified)

Original boox-rapid-draw is deliberately general-purpose — active in any app, anytime. Once it's driven by the bridge, that's no longer wanted: the overlay should only capture while a writing embed is actually focused, not over the Boox keyboard, Obsidian's own UI, or other apps.

`setWritingMode{active}` already carries exactly that signal. Changed `OverlayShowingService.kt` so `active:false` (or no session ever started) now calls `touchHelper.setRawInputReaderEnable(false)` — disabling raw capture entirely, not just widening the limit rect back to full-screen as before. `active:true` re-enables it, scoped to the embed's region. Also changed the initial state (right after the service starts, before any bridge message has arrived) to default OFF rather than full-screen-on.

**Trade-off, not a side effect:** this makes the overlay Obsidian-writing-embed-specific. If the stylus is used in other apps, rapid-draw's instant-ink no longer applies there.

**Reverted 2026-09-14** — broke coordinate accuracy on-device (same symptom as the earlier calibration bug: writes, but lands wrong). Root cause not diagnosed — plausibly `setRawInputReaderEnable` isn't safe to toggle freely outside the initial layout-change setup (undocumented SDK behavior), but that's a guess, not a finding. Backed out to limit-rect-only scoping (the last confirmed-working state) rather than keep guessing blind against an SDK with no available docs and no way for me to test locally.

**Revisit later, more carefully, if wanted:** isolate the reader-enable/disable toggle as its own single change (not bundled with anything else) so a regression is unambiguous, and test disabling *only*, without ever re-enabling, to check whether the toggle itself is the problem or specifically the disable→enable transition.

### Second attempt: made it opt-in (2026-09-14)

Since the earlier bug's root cause was never actually diagnosed (could be the reader toggle itself, could equally have been the stale-service confusion that muddied the first attempt's testing — see the correction above), tried again but this time gated behind an explicit, reversible setting rather than unconditional:

- New `utils/BridgePrefs.kt` — a `SharedPreferences`-backed `isObsidianOnlyMode` flag, **default `false`**.
- `OverlayShowingService.applyCaptureState()` — a single function both `onWritingModeChanged` and a new notification-action handler call. When a writing session is active, behavior is unchanged from the proven-working state (scope `setLimitRect` to the embed, reader enabled). When inactive, the reader is only disabled if `BridgePrefs.isObsidianOnlyMode` is true — otherwise (default) it stays enabled, i.e. today's exact behavior, unaffected.
- The foreground notification now has a second action button — **"Obsidian-only: OFF/ON (tap to toggle)"** — flips the preference at runtime, no rebuild needed to switch modes.

**Why this is safer than the first attempt:** if this still has the same undiagnosed bug, it now only affects the opt-in path — the default daily-driver experience (mode off) is byte-identical to the last confirmed-working state. Worth testing by explicitly toggling it on via the notification and checking coordinates stay correct, then toggling off to confirm it reverts cleanly.

**Operational reminder, still applies:** always manually restart the Boox Rapid Draw app after an Android Studio rebuild, not just reinstall — see the correction above for why.

**Actual bug found, 2026-09-14 (this time confirmed a real code mistake, not a stale build):** broke again even with Obsidian-only mode OFF, which should have been behaviorally identical to the last known-good state — ruling out the preference logic itself. Root cause: `applyCaptureState()`'s active branch called `touchHelper.setRawInputReaderEnable(true)` unconditionally — a line that didn't exist in the original working code. `onWritingModeChanged` fires on every camera move *and* every pen-calibration event (i.e. repeatedly through a single session), so that SDK call was firing redundantly, over and over, while actively writing — plausibly resetting some internal Onyx state mid-stroke. Fixed by tracking the reader's last-applied state (`rawCaptureEnabled`) and only calling `setRawInputReaderEnable` on an actual transition, not on every update. This is a more convincing explanation than the original undiagnosed regression from the first attempt — that one may well have had the same root cause all along.

**Still buggy after that fix too.** Decision (2026-09-14): stop chasing this. **Rolled back to `bccf0b6`** (the last confirmed-working commit) — `OverlayShowingService.kt` restored via `git checkout bccf0b6 --`, `utils/BridgePrefs.kt` removed. Confirmed the restored file is byte-identical to that commit. The companion app goes back to its original, general-purpose behavior: works in any app, all the time, no Obsidian-embed restriction.

**Then, disabling the bridge entirely (plugin setting off) worked fine — a real diagnostic clue.** This narrows the problem specifically to the bridge path (WebSocket server, port binding, session/process lifecycle), not stylus capture or Obsidian itself. Leading theory: `BridgeServer` binds a fixed port (8765); a "force-stop and reopen" doesn't strictly guarantee the *previous* process has fully died before a new one starts, so a stale process could still be holding that port and answering the plugin's connection while the newly-installed, correct code sits unused — which would explain "byte-identical code, still broken" without it being a real code bug at all. Consistent with: it eventually started working again "after some time" (i.e. long enough for the old process to actually die on its own).

### Third attempt: isolated to a separate dev-only install (2026-09-14)

Rather than keep testing this against the daily-driver install — which is what made every previous attempt costly to diagnose (each retest risked, and twice actually broke, working handwriting) — added `applicationIdSuffix = ".dev"` to the `debug` build type in `companion-app/app/build.gradle.kts`, with `resValue("string", "app_name", "Boox Rapid Draw (Dev)")` so it's visually distinguishable. Android Studio's Run button always builds `debug`, so **from this point on, Run installs a separate app ("Boox Rapid Draw (Dev)") alongside whatever's already on the device — it no longer overwrites the stable install.**

Re-added the full opt-in toggle implementation from the second attempt (`utils/BridgePrefs.kt` + `applyCaptureState()`/`setRawCaptureEnabled()` in `OverlayShowingService.kt`, including the redundant-SDK-call fix from the third attempt) into this now-isolated codebase, so it can be tested for real without risk.

**Important operational note given the port-binding theory above:** only run *one* of the two apps' foreground service at a time — stop the stable one before starting the dev one, and vice versa. Installing both is harmless; running both simultaneously risks exactly the port/SDK-session conflict suspected above, and would muddy any test result. If something still looks broken in the dev app, try a full device reboot before concluding it's a real bug, given how much process-lifecycle confusion showed up during this session.

**Correction, same day:** the "regression" above was a false alarm — after reverting, the bug was *still* present until the Boox Rapid Draw app was manually force-restarted (not just reinstalled). The old build was apparently still running in memory; Android Studio reinstalling the APK didn't cleanly restart the foreground service on its own. Confirmed working again after a manual restart. **Operational note for all future Kotlin iteration: always manually restart the Boox Rapid Draw app after reinstalling from Android Studio, before testing** — otherwise you're testing stale code and will misdiagnose real bugs. This may be the same root cause as boox-rapid-draw's own known issue #30 (palm rejection breaking system-wide, fixed only by a restart) — Boox's process management seems to not reliably tear down this app's service on its own.

## Diagnostic result (confirmed on device)
Tested with rapid-draw active + current plugin mitigations: **flash/pop at handoff confirmed, text deforms at the transition from overlay preview to final tldraw stroke.** This confirms the mismatch hypothesis (not primarily an SVG-count/jank issue) — the companion-app/single-source-of-truth design is the right fix, not a Canvas-renderer rewrite. Proceeding on that basis.

## Added requirement: must not regress under high stroke counts
Explicit ask: the fix has to hold up on pages with lots of strokes, not just look good in a quick demo. This interacts with the mismatch fix in a way worth calling out:

- Obsidian's WebView already coalesces/throttles `PointerEvent` delivery before the plugin ever sees it today. A companion app forwarding **raw** Onyx samples will likely run at a *higher* effective sample rate than what tldraw currently gets. Feeding every one of those points straight into a shape via `dispatch()` would make each stroke's point array denser than today's — i.e. naively "fixing" the mismatch could make the existing SVG-scaling problem worse, not better.
- **Mitigation:** the plugin-side bridge client must decimate/throttle the incoming point stream to a sane density (e.g. distance- or time-based simplification) before calling `dispatch()`, rather than forwarding every raw sample 1:1. The companion app itself should keep sending full-fidelity data — the density control belongs on the plugin side, next to where it already knows the current zoom/stroke-limit settings.
- The existing stash system (hide strokes older than N while actively writing, per `writingStrokeLimit`) is orthogonal to input source and continues to apply unchanged — no rework needed there, but per `BOOX_OPTIMIZATION.md`'s own "Future Improvement Ideas," auto-tuning `writingStrokeLimit` lower specifically on Boox is worth doing as part of this work rather than left as a someday item, since we're already touching this code path.
- **Acceptance bar for this requirement:** test with a long, heavily-written page (several hundred+ strokes) on-device, not just a fresh note, before considering this phase done. **Confirmed 2026-09-14 — stays smooth with lots of existing strokes on the page.**

## Revised phased plan

0. ~~**Spike:** confirm loopback WebSocket works from Obsidian mobile.~~ **DONE — confirmed 2026-09-14.**
1. **Companion app skeleton:** fork boox-rapid-draw (done — see `companion-app/`, added via `git subtree`). **Bridge output written 2026-09-14, unverified — no Android SDK on this machine, so this has not been compiled.** What changed:
   - `companion-app/app/src/main/kotlin/com/sergeylappo/booxrapiddraw/BridgeServer.kt` (new) — embedded `org.java-websocket` server bound to `127.0.0.1:8765`, speaking the same JSON schema as the TS side.
   - `OverlayShowingService.kt` — the three previously-empty raw callbacks (`onBeginRawDrawing`/`onRawDrawingTouchPointMoveReceived`/`onEndRawDrawing`) now forward each point through the bridge, converted from physical px to the plugin's CSS/viewport-relative space using density + `screenOrigin` (see "Coordinate calibration" above). Also narrows `setLimitRect` to just the writing embed's region while a session is active (previously always full-screen).
   - `AndroidManifest.xml` — added `INTERNET` permission (needed even for a loopback server).
   - `app/build.gradle.kts` — added the `Java-WebSocket` dependency.
   - **Before trusting this**, open `companion-app/` in Android Studio, let Gradle sync, and fix whatever the compiler flags — the `TouchPoint` field names (`.x`/`.y`/`.pressure`/`.timestamp`) were verified against OpenInkBridge's real source, not guessed, but everything else (exact `Java-WebSocket` API surface, Kotlin/Java interop edge cases) is unverified until it actually compiles.
2. ~~**Plugin WS client:**~~ **DONE — confirmed working 2026-09-14, ahead of the companion app itself.** Built entirely on the TS side against `dev-tools/mock-companion-server.mjs` (a fake companion app) rather than waiting on Kotlin work:
   - `src/types/bridge-protocol.ts` — the message schema
   - `src/utils/companion-bridge.ts` — WS client: connects, sends `setWritingMode`, decimates incoming `strokePoints` (screen-space distance threshold) before calling `editor.dispatch()` with synthetic `TLPointerEventInfo` (`point.z` = pressure), acks with `strokeDrawn`
   - Wired into `tldraw-writing-editor.tsx`: session starts on mount, rect resent on camera move, session ends on unmount
   - Settings: "Companion bridge (experimental)" toggle + port field, gated only by the setting (not `isEreader()`) so it's testable on desktop
   - **Verified on-device-adjacent (desktop Obsidian + mock server, 2026-09-14):** the mock server's simulated gesture rendered as a real tldraw stroke with zero touch/pointer input — confirms the core "companion app as input source, tldraw as sole renderer" design actually works, independent of whether the real companion app exists yet.
   - One real bug found and fixed in this process: the initial `setWritingMode` was sent immediately after opening the socket, before the WS handshake completed, so it was silently dropped. Fixed by buffering the latest mode and flushing it on `onopen` (also makes reconnects auto-resend the last known state).
3. **Camera/bounds sync:** **Partially done** — `updateRect()` fires on every `CameraMovedAutomatically`/`CameraMovedManually` activity, keeping the mock server's `rect` current through pan/zoom. Not yet stress-tested against rapid real pinch-zoom gestures for jitter/flooding.
4. **Session lifecycle:** **Partially done.**
   - Session starts on mount, ends cleanly on unmount (verified).
   - **Multi-embed ownership — done 2026-09-14.** `CompanionBridgeClient` now enforces a module-level singleton (`activeInstance`): starting a new session preempts — cleanly ends, including sending `setWritingMode{active:false}` — whichever session held it before. This is deliberately independent of the app's existing `embedStateAtom` (a single un-scoped jotai atom shared across every embed's React root — confirmed via `git grep`, no `Provider`/`createStore` anywhere in `src/`). Rather than depend on or try to fix that pre-existing, unrelated architecture, the bridge guarantees its own single-owner invariant directly, matching the physical reality that one companion app can only capture one screen region at a time.
   - **Still not done:** pane switching and app backgrounding don't yet explicitly end/restart sessions — they're only implicitly covered by React mount/unmount, which may not fire in every case (e.g. an embed scrolled out of view but not unmounted). Needs real-device testing to know if this matters in practice.
5. **Handoff/fade timing + resilience:** tune when the overlay's instant preview clears relative to `strokeDrawn`, add the companion app's foreground service, and build in an easy-to-reach disable toggle given the §"blast radius" risk above.
6. ~~**Scale validation:**~~ **DONE — confirmed 2026-09-14, stays smooth on a page with lots of existing strokes.** (Auto-tuning `writingStrokeLimit` down specifically for Boox in code, rather than the user setting it manually as done here, remains a nice-to-have, not blocking.)
7. **Stretch:** since the message schema is OIP-flavored, other OpenInkBridge-supported devices (generic Android, experimental reMarkable) could reuse the same plugin-side WS client with a different companion-app backend later.

---

## Coordinate calibration (found 2026-09-14, while reading real Kotlin source)

Checked `com.onyx.android.sdk.data.note.TouchPoint`'s actual fields by finding how OpenInkBridge's own Boox backend reads them (`android/openinkbridge-sdk/src/main/java/org/openinkbridge/sdk/Adapters.kt` in the `GoVed/OpenInkBridge` repo — not guessed, verified against real working code): `.x`, `.y`, `.pressure` (Float, already ~0–1 normalized based on how it's used), `.timestamp` (Long). `onBeginRawDrawing`/`onRawDrawingTouchPointMoveReceived`/`onEndRawDrawing` map directly onto our down/move/up phases.

That same reference code revealed a real problem: it explicitly tags its point data as `PenPointCoordinateSpace.HOST_VIEW_LOCAL_PHYSICAL_PIXELS`. Onyx's raw touch points are in **physical device pixels**, screen-relative (the overlay is a full-screen `MATCH_PARENT` window at `(0,0)`). tldraw's `dispatch()`, per `getPointerInfo()` in the vendored package, expects **CSS pixels** matching a real `PointerEvent`'s `clientX`/`clientY` — relative to the *browser viewport*, not the physical screen. Two mismatches, not one: a **scale** difference (physical px vs. CSS px, i.e. `devicePixelRatio`) and an **origin** difference (full physical screen vs. wherever the WebView's content area happens to sit — below Obsidian's own toolbar, status bar, etc., which shifts and isn't knowable from Kotlin alone).

**Chosen fix — keeps Kotlin dumb about tldraw, keeps the existing TS/protocol/mock untouched:**
- Kotlin already knows its own screen density (`resources.displayMetrics.density`) — no need to send `devicePixelRatio` over the wire.
- The **origin** offset is the one thing only the *plugin* can know, and only from a real event: a real pen `PointerEvent`'s `screenX/screenY` (OS-screen-relative) minus its `clientX/clientY` (viewport-relative) gives exactly the viewport's position on-screen, in CSS px. The plugin captures this from the first real pen `pointerdown` it sees and sends it as `screenOrigin` in `setWritingMode`.
- Kotlin converts *before* sending, not after: `cssX = touchPoint.x / density - screenOrigin.x` (same for y), so the `strokePoints` messages it emits land in exactly the coordinate space `companion-bridge.ts` and the mock server already use — **zero changes needed to already-verified TS code** for this. The conversion math is new Kotlin-only surface area, isolated from everything already proven to work.
- Bonus: the same `screenOrigin` + `rect` + `density` lets Kotlin properly scope `touchHelper.setLimitRect(...)` to just the writing embed's region instead of the whole screen — the existing file has a literal `// TODO actual bottom place is calculated incorrectly due to the status bar...` comment marking this as already a known unsolved problem in upstream boox-rapid-draw, not something this introduces.

## Open decisions for next session
- Confirm Phase 0 spike result before investing further.
- Decide whether to literally fork `boox-rapid-draw`'s repo or write a fresh minimal overlay app referencing its approach (fork is less work, inherits its existing issues too).
- Decide companion app distribution: sideloaded APK only, or eventually something more formal — affects how much onboarding/permission UX polish is worth building early.

**Note:** boox-rapid-draw is already installed and in daily use on the target device. This means:
- Permission/onboarding setup for Phase 0 is already done — the WS spike can be tested immediately, no fresh install/grant flow needed first.
- The fork will **replace** the current install rather than run alongside it — two overlay apps both holding `SYSTEM_ALERT_WINDOW` over the same region will conflict, so this swaps out an app already relied on daily, not an addition to test in isolation.

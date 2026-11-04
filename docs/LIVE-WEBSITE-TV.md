# Private live website TV

This local session feature displays a browser-consented tab video on the existing physical TV. It does not embed the website, bypass framing policies, or add a website provider to world data. Authored `elsemesh.media-screen/1` remains YouTube only; existing YouTube links, timestamps, search, playback and sound remain available.

## Use

1. Open TV controls and enter an HTTPS address in **Website URL**, then choose **Open website (new tab)**. The new tab uses `noopener,noreferrer`; addresses with credentials or non-HTTPS schemes are rejected.
2. Choose **Share browser tab** and explicitly select the website tab in the browser picker. Opening an address does not select or automatically share it. Only one live browser video track is accepted; window, monitor and audio tracks are rejected and stopped.
3. Interact with the website in its source tab. Subsequent navigation in that tab stays shared until **Stop TV**, browser **Stop sharing**, source closure, or another teardown. **Return to game** keeps the TV sharing session.

Sharing is video only (`audio:false`) and the local video element is muted. Fred's typed avatar speech and existing YouTube sound remain independent. The browser's sharing indicator remains authoritative. Browser hints exclude self, monitor, source switching and system audio where supported; runtime track settings independently require a browser surface.

The shared video uses the TV's existing 1280 × 720 perspective projection, conservative occlusion mask and viewport clipping. Its content fits inside the TV without distortion or cropping, with black space as needed. The shared surface does not receive pointer input in Fred.

## Lifetime and privacy

Permission starts directly in the share button's user gesture. A generation token rejects stale results after Stop, disposal, another request, provider replacement, or active-world/authority loss. Every rejected or released stream has every track stopped. Permission denial preserves the current player. Capture URLs, track labels and identifiers do not enter world data, persistence, federation or diagnostics.

Hiding or natively blurring Fred pauses, mutes and hides the shared presentation but retains the explicitly consented stream so the source tab can be used. The heartbeat continues to check world/authority ownership while hidden. Return checks ownership before displaying or playing again, without another capture request. YouTube's previous hidden-stop behavior remains in place. Stop, browser revocation/source closure, YouTube replacement, world/authority loss, disposal, `pagehide` and unload remove the shared video, clear `srcObject` and stop all tracks. Starting again requires another explicit sharing action.

## Evidence boundaries

`node --test test/media-screen.mjs test/media-screen-native-avatar.mjs` covers lifecycle races, denial and invalid capture, all-track cleanup, stale events, hidden ownership checks and focus return, YouTube fallback, safe website opening and existing geometry/occlusion regressions. These unit tests do not qualify browser permission UX, real source navigation, simultaneous recording, native OS focus behavior or the final encoded film. Those require the private real-browser acceptance run before delivery. No publication is part of this change.

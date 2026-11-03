// Shared sizing policy: manual modes retain their backend's existing DPR limit.
// Native mode opts into device DPR, bounded by a strict 1440p pixel-count ceiling.
export function outputPixelRatio({width, height, devicePixelRatio = 1, maxOutputPixels = Infinity, nativeResolution = false, legacyLimit = 1}) {
 const area = Math.max(1, width * height);
 const device = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
 const cap = nativeResolution ? Math.min(3686400, maxOutputPixels) : maxOutputPixels;
 return Math.min(nativeResolution ? device : legacyLimit, Math.sqrt(cap / area));
}

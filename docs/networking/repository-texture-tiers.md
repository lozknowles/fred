# Optional authenticated texture tiers

Hosted repository WebGL candidates can show a small embedded PNG/JPEG GLB first,
then fetch higher resolution texture-only GLBs when a view approaches an instance.
The ordinary asset remains the coarse, fully authenticated fallback. Existing
repositories require no changes. WebGPU, folder imports, GitHub sources and retro
terminal replacements continue to use the ordinary asset.

In the existing hashed `assets.json` component, an asset may include:

```json
"textureTiers": [{
  "path": "assets/<64 lowercase hex SHA-256>.glb",
  "sha256": "<same 64 lowercase hex SHA-256>",
  "bytes": 565148,
  "distance": 8
}]
```

The existing component hash authenticates these references. The outer manifest
and deployment/authority pins continue to authenticate the component. Recompute
the assets-component hash, snapshot identifier and outer deployment pin using the
normal repository workflow. Do not insert an unauthenticated runtime sidecar.

Up to three tiers are permitted, with strictly increasing complete file sizes and
decreasing positive distances (at most 2000 metres). Each file is at most 6 MiB;
all finer tiers in one candidate total at most 24 MiB. The runtime checks complete
file size and SHA-256 before inspection or image decoding. A tier must retain the
same JSON scene, materials, samplers, UVs and geometry buffer bytes; only embedded
image byte offsets, lengths and pixels may change. Keep geometry buffer views at
the same positions when authoring files. The source and licence on the ordinary
asset cover its derived tiers; preserve attribution and record authored changes.

Active, portal and player-eye view cameras drive promotion. An asset has one job
at a time across its instances; one job runs per candidate. Tiers advance in order
on subsequent frames. Existing texture identities/settings are retained, so all
material clones receive new pixels while keeping overrides, UV transforms, colour
space and normal-map conventions. A failed promotion keeps the coarse/current
image and is not retried until the candidate is rebuilt. Disposing a candidate
aborts its hosted request and discards any result already decoding. Loaded tier
scenes remain candidate-owned until disposal. Resident candidates retain promoted
levels rather than downloading again on approach.

`tools/package-opening-world.mjs` verifies every complete referenced tier and its
texture-only equivalence before including it in the normal tracked-file package
inventory. The general vendored `packWorldRepository` preserves tier metadata but
has no tier-byte provider: authoring tools must copy the referenced tier files into
the repository and commit them. The opening-world packager catches missing,
untracked, altered and incompatible tier files.

This is independently hashed whole-tier fetching, inspired by Ed's coarse-first
distance refinement. It is an original implementation; no Ed loader code was
copied. The existing repository admission rejects KTX2/BasisU, and its GLTFLoader
has no KTX2 decoder. KTX2 range streaming is therefore deliberately unsupported.
Whole-asset SHA-256 cannot authenticate arbitrary partial responses. HTTP Range,
ETag and multi-range server support are unnecessary for this implementation.

Run `node --test test/repository-texture-tiers.mjs` for byte/hash, sequencing,
round-trip, normal-runtime integration and disposal checks. The Node integration
uses the actual GLTFLoader with a CPU ImageBitmap stand-in; it does not establish
GPU upload, visual quality, FPS or device acceptance. Existing Warehouse assets
without tier metadata receive no transfer-size improvement.

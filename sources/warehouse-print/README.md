# Private Warehouse architectural print

Original procedural architectural illustration, not a photograph or a downloaded image. Copyright (c) 2026 Lawrence Knight, licensed MIT (repository LICENSE terms). `generate.mjs` is its complete original source. It creates a muted sepia warehouse-interior study and derives the 32×48 coarse image by exact 24×24 area averaging from the 768×1152 fine image. No external imagery or AI image generation is used.

The existing muted warehouse photograph object `warehouse:object:1338` keeps its name, frame, position, rotation, scale and collision. Only its asset ID and colour multiplier change. Its new unique asset reuses all 912 nonimage GLB bytes, including geometry, normals, UVs and indices, from `warehouse:box-graffitiCream` (original MIT recipe attribution retained). One material slot gains the embedded PNG, with the same sampler and material semantics in both tiers. All other world objects/assets remain intact.

The ordinary `asset.file` points to coarse GLB. The optional `asset.textureTiers` reference pins fine GLB by SHA256 and byte length, with an 8 m approach distance. A compatible runtime verifies and promotes only the embedded image. An older runtime safely shows the ordinary coarse texture. `tiers.json` records image dimensions, file hashes and the original nonimage payload hash. Authoring provenance is also retained in the hashed assets component.

`integrate.mjs` rebuilds immutable component hashes/snapshot from the aa50df base; it is an authoring tool and is never executed by a player. This candidate is private and has no upstream publication. CPU checks do not establish GPU rendering or device acceptance.

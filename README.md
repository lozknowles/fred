# Fred

Fred is a public world engine and player for Loz's Warehouse Island and its connected published worlds. [Play Fred](https://hpubuntu.taila22e8a.ts.net:8443/) · [Download this release](https://github.com/lozknowles/fred/releases/tag/fred-warehouse-2026-11-19) · [Browse the source](https://github.com/lozknowles/fred) · [Publication and build instructions](docs/PUBLICATION.md)

The current playable release uses engine revision [`cd8cddd6eab45528fe48ba46eda423c14a51ea56`](https://github.com/lozknowles/fred/tree/cd8cddd6eab45528fe48ba46eda423c14a51ea56) and authored world revision [`5b459c62a92ead5cdc3d499caf0c7d07426b12bf`](https://github.com/lozknowles/fred/tree/5b459c62a92ead5cdc3d499caf0c7d07426b12bf). The public source branch is `public`; its authored world branch is `warehouse-world`. The `main` branch retains separate development work. The engine's `public/opening-world.json` pins the exact world commit and manifest digest. Branch tips can move; the recorded revisions identify this release.

The warehouse includes the beach exit, computers and TV, detailed furniture and props, and connections to Table Tennis Room, Bracken Quay Dock and Neon Shift. See the [changelog](CHANGELOG.md) for earlier engine changes. A source checkout and a deployed build have separate identities; the publication receipt records what was actually deployed.

## Play

WASD walks, mouse drag or arrow keys look, Shift runs, Space jumps, E uses nearby computers or the TV, V switches first-person/follow view, K designs your avatar and H shows or hides controls. The YouTube TV requires an internet connection and the video's embedding permission. Published installations use WebGL2; first-load shader compilation can take time.

The public package bundles the pinned world data for local loading. It does not grant admission to another player's private world or include an owner authority, credentials, private keys or session state. Optional owner services require separate configuration and permission. The Microduck companion runs locally in the browser session and is not a shared or persistent online character.

## Develop and package

The verified build uses Node.js 24.19.0 and npm 11.17.0. Run `npm ci` and `npm run dev` to develop the engine. `npm run build` compiles the engine into `dist`; it does **not** produce the complete published game. Full multi-world packaging also needs a clean checkout of the pinned world commit and a previous reviewed publication containing the editor and publication provenance. The packaging bootstrap is separate from the filtered playable static release. See [the verified build and packaging procedure](docs/PUBLICATION.md).

Engine and authored world source live on separate branches of this repository. Editing a world does not require changing engine source. `package.json` retains `private: true` to prevent accidental publication to npm; this does not make the GitHub source private.

Fred retains the existing `elsemesh.*` world and protocol identifiers, browser storage keys and `ELSEMESH_*` configuration names for compatibility with authored worlds, saved avatars and owner services.

## Licences and provenance

Engine code is covered by [LICENSE](LICENSE). Models, textures, scenes, media, fonts and other third-party material retain their own licences and attribution; the engine licence does not replace those terms. In particular, Microduck geometry and adaptations are CC BY-NC-SA 4.0 and this package is a noncommercial demonstration. Keep [CREDITS.md](CREDITS.md), [licence notices](LICENSES), the packaged credits and each world's attribution with redistributed material.

The packager validates world identities, immutable content hashes and source provenance. [Publication notes](docs/PUBLICATION.md) explain the engine/world pins and the distinction between the complete local package and the public static package. See also [native owner setup](docs/owner-world-setup.md), [world repository quickstart](docs/repository-world-quickstart.md) and [implementation evidence](docs/owner-implementation-status.md).

## Archived ElseMesh edition

The earlier ElseMesh edition remains available separately: [play the archived opening island](https://lozknowles.github.io/ElseMesh/) · [archived downloads](https://github.com/lozknowles/ElseMesh/releases) · [archived world data](https://github.com/lozknowles/elsemesh-world-loz-opening-island) · [world builder source](https://github.com/lozknowles/elsemesh-worlds).

Those links describe the earlier edition, not the current Fred release. Original public branch and tag tips are preserved under the `archive/engine/` and `archive/warehouse/` namespaces. Compatibility modules and historical tests remain in Git history; their presence does not make the retired combined-island game a current launch option.

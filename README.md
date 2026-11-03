# Fred

Fred is the private world engine and player for Loz's Warehouse Island. The game engine is on [main](https://github.com/lozknowles/fred/tree/main) and the authored world is on [warehouse-world](https://github.com/lozknowles/fred/tree/warehouse-world). The public game continues to serve the last public release. [Play the public release](https://lozknowles.github.io/ElseMesh/).

To work on both components, clone this repository and create a sibling world checkout with `git worktree add ../opening-world warehouse-world`. Build the engine with `npm ci` and `npm run build`. The engine pins the exact world revision in `public/opening-world.json`. Package from a clean checkout of that revision using `tools/package-published-worlds.mjs`; its fourth argument is the previously shipped static site. Add `--fresh-origin` when building a new local preview that has no previously open tabs. It preserves the editor and licences while omitting historical application chunks. Original public branch and tag tips are preserved under the `archive/engine/` and `archive/warehouse/` namespaces.

Fred retains the existing `elsemesh.*` world and protocol identifiers, browser storage keys and `ELSEMESH_*` configuration names for compatibility with authored worlds, saved avatars and owner services.

## Archived ElseMesh edition

[Play the opening island](https://lozknowles.github.io/ElseMesh/) · [Download the complete island](https://github.com/lozknowles/ElseMesh/releases/latest) · [Browse the archived public world data](https://github.com/lozknowles/elsemesh-world-loz-opening-island) · [World builder](https://github.com/lozknowles/elsemesh-worlds)

The default game opens Loz's warehouse island: beaches, sea, mountains, the warehouse, portal, computers and a large TV. The opening picture depicts this world. The retired combined-island game is not a launch option or part of the downloadable play package.

## Download and play

On the GitHub **Releases** page, download the **Loz-Warehouse-Island-Exit-TV.zip** asset. It includes the built game, a pinned copy of the public opening world, its terrain and asset files, the splash, the two built-in player avatars and a tiny local web server. It does not need a GitHub connection to load the world. Extract it, run `node start-local.mjs` with Node.js 22.15 or newer, and open `http://127.0.0.1:18888/`. Browsers do not reliably run this game by double-clicking `index.html`.

WASD walks, mouse drag or arrow keys look, Shift runs, Space jumps, E uses nearby computers or the TV, V switches first-person/follow view, K designs your avatar and H shows or hides controls. Visiting another player's live world requires that player's separate owner application and permission; this downloadable copy is a single-player public snapshot.

## Source and world ownership

Fred holds reusable rendering, physics, player controls, networking, federation and supported behaviour code. The authored island is on the [warehouse-world branch](https://github.com/lozknowles/fred/tree/warehouse-world). Its [archived public snapshot](https://github.com/lozknowles/elsemesh-world-loz-opening-island) retains its own attribution. The complete release archive bundles that snapshot for fast, reliable first launch. The world ID, repository commit and content digest are pinned in `opening-world.json` inside the archive. Editing a world never requires changing engine source.

Use `npm ci && npm run dev` to develop the engine. To play the private Warehouse, build and package the pinned world from a local authenticated checkout as described above. The resulting package reads the world locally without a GitHub sign-in. For exact packaging and verification, see [public opening-world deployment](docs/public-opening-world.md).

The engine still contains shared modules needed to bring earlier gameplay into permissioned worlds. Their presence in the source does not make the retired combined game a launchable download. Git history remains available for audit.

## Current limits

The public snapshot is offline single-player and cannot grant live portal admission to private worlds. The YouTube TV requires an internet connection and the video's own availability; the island and its geometry do not. Published installations currently use WebGL2. First-load shader compilation can take time. The downloadable package is static and does not include an owner authority, credentials, private keys or the editable world builder.

## Rendering work in source version 0.2.0

This source version adds runtime graphics controls, an opt-in Sunset supersampling experiment, improved TV video presentation, and a faster ground-collision broad phase. Supersampling is off by default and applies only to the qualified Sunset world. The graphics controls let players choose runtime quality settings; they do not guarantee a particular frame rate.

These changes describe the repository source. The published website and downloadable archive are separate builds; availability depends on the deployment and release process. Check the [GitHub Releases](https://github.com/lozknowles/ElseMesh/releases) page for a matching release before assuming these changes are in a published build. See [CHANGELOG.md](CHANGELOG.md) for details and known limits.

See [native owner setup](docs/owner-world-setup.md), [world repository quickstart](docs/repository-world-quickstart.md), [implementation evidence](docs/owner-implementation-status.md), [licences](public/credits.html) and [world-attribution records](https://github.com/lozknowles/elsemesh-world-loz-opening-island).

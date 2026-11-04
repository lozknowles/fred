# Public opening world and complete release package

The reusable engine reads a validated, pinned world through its common repository loader. The source build's `public/opening-world.json` selects a published public commit. Its world ID is independent of the repository URL. The engine and authoring repository remain separate.

For a downloadable release, `tools/package-opening-world.mjs` verifies a **clean public world checkout at the exact configured commit**, the manifest SHA-256 digest, world identity, schema, asset hashes, paths and capability requirements. It copies that immutable world content under `worlds/loz-opening/` and writes an `elsemesh.opening-world/2` configuration. The version 2 `bundlePath` is a restricted same-origin relative directory. Its repository URL records provenance; startup reads the bundled files, not GitHub. The shared loader validates them again. The public copy cannot grant private VIEW/ENTER permissions or alter an owner ledger.

## Reproduce the downloadable archive

Build on the development host using Node.js 22.15 or newer:

```sh
npm ci
npm run build
node tools/package-opening-world.mjs dist /path/to/clean/public-opening-world-checkout /path/to/new/output
(cd /path/to/new/output && zip -qr ../Loz-Warehouse-Island.zip .)
```

The checkout must be the exact full Git commit in `public/opening-world.json`, with no uncommitted or untracked files. The output directory must not already exist. The package includes the compiled runtime, its assets, relevant licence notices, credits, pinned world dependencies and a local server. Launch `node start-local.mjs` and browse `http://127.0.0.1:18888/`. The YouTube TV requires an internet connection. Press E by the TV, paste a YouTube video link and choose Play on TV. Search opens YouTube in another tab. Playback follows the video's embedding permissions.

Fred's avatar panel accepts up to 180 characters for the owner's configured private voice. Speak typed text generates a line, Play typed line repeats it, and J replays it while exploring. Text and generated audio remain in session memory. Stop suppresses the result of pending work. The service remains busy until that work finishes.

The optional voice connection uses an external JSON file selected by `FRED_VOICE_CONFIG`, defaulting to `.config/fred/voice.json` in the user's home directory. Its fields are `host`, `port`, `helper`, `configuration` and `lock`. The latter three are absolute paths on the operator's private SSH host. Install `tools/avatar-voice-worker.mjs`, `tools/networking/SpeechProvider.mjs` and `src/network/SpeechText.js` there with the same directory structure and ES module configuration. The remote configuration uses the existing accepted profile loader's `endpoint`, `profilePath` and `tokenPath`. The worker must be the qualified synchronous Voice Lab HTTP server. The helper probes its readiness before synthesis and runs under `flock`. Keep all connection settings, credentials and reference material outside the game package. The packaged `.fred-server` folder contains generic server code and is excluded from HTTP access. An installation without private settings displays an unavailable message.

The world `world.json` digest pins authored content. The game revision, exact world commit, digest and archive SHA-256 identify a reproducible release. To change the opening world deliberately, update the public world repository, verify and publish its immutable revision, then update the engine distribution pin and rebuild. A remote branch changing does not update a running copy.

GitHub's generated source ZIP is for development and may contain compatibility modules and archived tests. The named Release ZIP is the complete fast play download. Directly publishing this prepared static tree to GitHub Pages uses no Actions build. A nested Pages path works because built assets and the bundle are relative to the entry page.

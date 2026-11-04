# Private Sun AI terminal

The Warehouse Sun workstation opens an interactive terminal with a choice of the official Codex or Claude Code CLI. Each browser owns separate, temporary provider sessions. The focused terminal and physical monitor display actual PTY output only in that browser; neither content nor account state is sent to other players or stored in world repositories.

Use E near the Sun workstation, choose a provider, then Connect. Follow the official provider sign-in link in a separate browser tab, sign in to your own account there, and return to Resume session. Claude can request an authorization code pasted into the terminal. Fred does not present a password or API-key form. A connected terminal does not mean account sign-in has completed. Codex device sign-in may require enabling device authentication in personal or workspace settings.

Leave disconnects input and clears the local display. The same browser can resume for 60 seconds. End session and sign out destroys that temporary environment and its local credential cache; it does not sign other devices out of the provider account. Work is temporary, with no file export or persistent workspace implemented. Ending or expiring a session deletes its files. Sessions expire after 30 minutes, or after 60 seconds disconnected. Reloading the page does not retain a session identifier.

## Operator setup

This is an optional loopback-only server feature. Static hosting shows an unavailable message and never falls back to shared credentials. The local server reads `FRED_TERMINAL_CONFIG`, or `~/.config/fred/terminal.json`, outside the served game directory:

```json
{"host":"dedicated-worker","port":2222,"worker":"/absolute/path/ai-terminal-sandbox.py"}
```

The operator's SSH configuration authenticates the bridge using a fixed worker path. Browser input travels on stdin as bounded NDJSON; it never forms an SSH command. Keep this configuration outside any published package. Do not expose the loopback broker on a public interface or reverse proxy it as a multi-user service: a public service needs independent user authentication and deployment qualification.

The Linux worker requires a qualified Bubblewrap/user-namespace installation, delegated systemd user scopes, Python 3, Node, a current CA bundle and the pinned unmodified official provider executables. The shipped Claude runtime path is version-specific; qualify and update it deliberately when upgrading. No automatic installation or upgrade runs in a user session.

The worker creates separate mount, PID, user, IPC and network namespaces, a read-only runtime and root, and bounded writable HOME/workspace/tmp filesystems. Limits are 50% CPU, 1.5 GiB RAM, no swap and 128 tasks per session. Networking is available only through its fixed per-provider HTTPS CONNECT allowlist, with public DNS addresses pinned before connection. No host home, SSH agent, Docker socket or inherited authentication variables enter the environment. Stop, SSH EOF and worker death trigger whole-scope cleanup through a separate liveness watchdog.

The broker uses same-origin checks, an HttpOnly SameSite cookie, CSRF tokens and short-lived one-use WebSocket attachment capabilities. It retains bounded terminal output only for the same browser's disconnect grace period. No transcripts or provider codes are logged. Explicit user paste is allowed; remote terminal escape sequences cannot change the clipboard. The screen clears when focus or authority is lost. There are at most two live provider sessions on this local server.

## Qualification and limits

Run `node --test test/sun-computer.mjs test/local-ai-terminal.mjs test/ai-terminal-sandbox.mjs`. Unix proxy integration cases require Linux. Real-host namespace/resource/cleanup and empty-account provider prompts must be requalified after runtime changes; mocks cannot establish isolation. A user must complete each provider's own login and submit a real request before claiming account-qualified operation. CLI capability, account plans and approved network destinations can change.

References: [Codex authentication](https://developers.openai.com/codex/auth), [Claude authentication](https://code.claude.com/docs/en/authentication), [Claude hosted use](https://code.claude.com/docs/en/legal-and-compliance), [Bubblewrap security](https://github.com/containers/bubblewrap#sandbox-security).

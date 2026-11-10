# Dedicated public Fred profile

This profile serves an explicitly approved, hash-verified static manifest and
`/api/period-sun/*` only. It never imports the local AI/voice server. The private
repository and administrator configuration stay outside the static root.

`public-fred-server.mjs` takes a private JSON configuration containing `root`,
`manifestPath`, `origin` (exact HTTPS origin), `worker` (absolute Python path),
`port` (loopback port), and `maxGuests` (1–4, recommended 2). Run:

```
node tools/public-fred-server.mjs /private/public-fred-config.json
```

The external manifest is `{ "schema":"fred.public-static/1", "files": {
"index.html":"<sha256>", ... } }`. Every entry is checked before listening.
Only review-approved release files belong in this manifest. No directory
enumeration, arbitrary proxy URL, or SPA fallback is provided. Hidden files,
source/tools/tests, package metadata, private configuration, publication receipts,
and portrait presets are refused even if listed. Deploy to an immutable release
directory; hashes are verified at startup, not on every response.

At startup the server also builds gzip variants of verified `.bin`, `.json`,
`.js`, `.css`, and `.glb` files when encoding reduces their size. No request triggers
compression work. Each variant has an ETag based on its encoded bytes,
`Vary: Accept-Encoding`, and its encoded Content-Length; the browser receives
exact original bytes after decoding. Range responses retain the original
representation and honor matching original If-Range validators. No compression
sidecar paths become public. The measured 12 MB opening-island binary transfers
as 4.4 MB; actual browser acceptance remains necessary for each public route.

The intended always-on host is hpubuntu. An isolated Tailscale Funnel HTTPS
listener on port 8443 can proxy to this profile's dedicated loopback port without
changing the existing port 443 routes. Record `tailscale funnel status --json`
before and after; enable only after the primary has approved the exact candidate
and static manifest. The link is public to anyone and resource capacity is
shared. Funnel's operator availability and bandwidth limits apply.

Anonymous visitors receive independent Secure/HttpOnly/SameSite cookies, CSRF
tokens, one-use WebSocket tickets, one live guest per owner, and a shared bounded
guest cap. Cookies are not proof of human identity; the cap also limits anonymous
cookie rotation.
Guestless cookie owners are evicted oldest first when the bounded owner map is
full; owners with live guests remain admitted. A malformed WebSocket handshake
consumes neither the one-use ticket nor the unattached-guest deadline. The
endpoint is `/api/period-sun/ws`, matching the frontend URL validator.

Cookies are scoped to the HTTPS hostname rather than to a port. Existing
HTTPS services on other ports of this same user-controlled hostname share that
cookie trust boundary. They must remain trusted; this release does not claim
isolation from malicious sibling services on the same hostname.

Each worker invocation must retain snapshot disks, a private
temporary QMP socket, `-nic none`, and a host-side execution deadline. Closing the
socket ends the guest; unattached sessions time out after 30 seconds; attached
sessions end after 15 minutes. Ending a guest discards its changes.

Use a dedicated unprivileged user systemd unit, separate release/config directory,
`NoNewPrivileges=yes`, `PrivateTmp=yes`, `ProtectSystem=strict`,
`ProtectHome=read-only`, `MemoryMax=1G`, `TasksMax=64`, and `CPUQuota=200%`.
Set `Environment=TMPDIR=/tmp`: an inherited `/tmp/user/1000` temporary directory
is absent inside `PrivateTmp`, causing QEMU snapshot creation to fail.
The worker reads the administrator guest image and writes only private temporary
snapshot/display data. Verify the service with the actual guest before enabling
Funnel. Roll back by disabling only `tailscale funnel --https=8443 off`, stopping
the dedicated unit, and retaining release receipts. Never reset all Funnel state.

Validation: `node --test test/public-fred-server.mjs` exercises two independent
cookie jars, distinct child allocations, rejected cross-owner attach/end,
capacity, Origin/Host checks, static exclusion, and slot release. Actual QEMU
network/disk/process isolation requires additional host-side evidence.

Private host qualification on 10 November 2026 passed with two concurrent real
NetBSD 1.6.2 `fred` guests, independent anonymous cookie jars and WebSockets. One
guest wrote a file while the other verified its absence. Cross-owner termination
returned 404 and a third guest returned 429. Both processes exited on socket
closure; no QEMU remained and sealed base SHA256 stayed
`e857e1284521d8974686682a8c566f8f8f46387ebaa08cc2093ea77bb34500e3`.
This is HTTP/WebSocket and real-guest evidence, not browser gameplay acceptance.

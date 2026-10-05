# Luce Remote

User authorized full implementation and Cloudflare hosting, replacing Tailscale. Preserve all existing uncommitted Accounts/UI changes and running user terminals.

## Outcome
Phone home-screen web app with projects, current terminals, live output, input/interrupt/close/new session, exact live Mac browser preview with click/scroll, structured Codex and Claude approvals, notification subscription, QR pairing, revoke, and reconnect. Mac stays online/awake; desktop offers a keep-awake toggle while remote access is enabled. No VPN/mobile native app or public local ports.

## Architecture
Cloudflare Worker serves static mobile assets; SQLite Durable Object per host relays authenticated WebSockets. Mac makes outbound WSS connection. Per-device 256-bit pairing keys in QR URL fragment encrypt all session messages with AES-GCM. Relay sees host/device identifiers and connectivity, not plaintext terminal commands or preview frames. Host enrollment uses a private registration token kept only in the Mac profile and Worker secret, never bundled into public assets. Browser source delivery remains trusted. Device revocation invalidates relay credentials and Mac pairing keys.

One Mac host owns each PTY. Phone input is explicit; reconnect never repeats a mutating request. Authenticated encrypted handshake produces a fresh host connection nonce to reject replay after restart. Reject oversized/malformed frames. No remote filesystem browsing, arbitrary fetch URLs, account credentials, or unrestricted RPC. New/resumed terminals use existing validation and account isolation.

Approvals bind to the terminal and exact pending request. New Codex terminals use an owned stdio app-server through an private local Unix WebSocket proxy protected by a random path, 0700 directory, and 0600 socket consumed by CLI --remote, intercepting requests on the owning connection. Claude PermissionRequest hooks wait for a Luce decision; desktop and phone can resolve the same pending request, timeout returns control to Claude's native prompt. Preserve previous user hooks/status lines. Already running old terminals remain controllable through phone terminal input; structured cards need a terminal launched with the adapters. No daemon restart or lock deletion.

Preview is JPEG capture of the existing native browser when applicable, or a hidden sandboxed view for a known responsive local project server. Phone click and scroll target that view. No arbitrary remote URL fetch endpoint. Browser frames encrypted through relay; no project website made public.

## Interface contract
RemoteHost in src/main/remote-host.cjs: constructor({directory,relayURL,registrationToken,request}); methods enable(), disable(), createPair(name) -> {url,deviceId}, revokeDevice(id), publish(event,value), status(), close(); EventEmitter changed/phone-connected/phone-disconnected. Persistent credentials mode 0600. status returns enabled,connected,url,message,devices public metadata only.
Shared src/shared/remote-protocol.mjs: deriveRelayToken(key), seal(key,value), open(key,packet); PhoneConnection({relayURL,hostId,deviceId,key}) with connect(), request(method,params), close(), onEvent(event,value), onStatus(status). Phone pair fragment is #pair=base64url(JSON of {hostId,deviceId,key,relayURL}). Relay URL is origin, phone page /.

RPC (request callback validates all arguments): state -> {projects,terminals,accounts,approvals}; terminalSnapshot {id} -> {buffer,outputOffset,cols,rows}; write {id,data}; interrupt {id}; close {id}; create {projectId,provider,accountId?,conversationId?}; approve {requestId,decision:'accept'|'decline'}; preview {id} -> {jpeg,width,height}; previewInput {id,type:'click'|'scroll',x,y,deltaY}; pushKey -> {publicKey}; pushSubscribe {subscription}; pushUnsubscribe {}.
Events state (snapshot), terminal-data ({id,data,offset}), approvals (list), notice ({message}). No phone terminal resize (retain Mac geometry; phone scrolls/zooms).

ApprovalService src/main/remote-approvals.cjs: constructor({directory}); start() optional promise; list(); resolve(requestId,decision); removeTerminal(id); close(); EventEmitter changed, session ({terminalId,conversationId}). launchOptions(id,project,{provider,conversationId,env,file,args}) -> {file,args,env,settings?} for synchronous TerminalManager.create. Wrapper inherits its real PTY; startup waits for proxy readiness before CLI. Each terminal registers secret with local broker. Parent injects launch factory into TerminalManager. Agent owns factory integration in terminals.cjs and preserves Claude usage bridge.

## Validation
Real authenticated Worker relay smoke: enrollment, pairing, encrypted RPC/output, replay/stale rejection, invalid auth/origin, revoke, reconnect. Phone browser test against local Wrangler includes terminal input, counts, approval cards, preview frame and installation instructions. Owned Codex transport tested with deterministic JSON-RPC fixture plus real installed CLI startup without inference. Claude hooks tested for pending/resolve/timeout and existing settings preservation. Installed Electron smoke and signature validation. Cloudflare deploy is explicitly authorized.

Verified transport constraint: installed Codex 0.160.0 rejects bearer-token options for unix:// remotes. The proxy therefore uses local OS access controls rather than a bearer header; the encrypted Cloudflare connection remains separately authenticated.

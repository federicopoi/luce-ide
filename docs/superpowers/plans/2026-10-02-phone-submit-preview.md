# Phone submission and interactive preview

Intent: Send from phone must submit typed Codex input rather than leave a draft. Website preview must be usable for actual browsing on phone: tap, swipe, form text and basic navigation. Keep desktop terminals and websites undisturbed.

1. Reproduce Codex paste/Enter timing with installed CLI and local /status command, no model inference. Implement reliable explicit submission with regression, late-exit safety, and compatibility with already running old Mac host.
2. Add phone-responsive offscreen preview, bounded pointer/scroll/text/key/back-forward-reload controls with known-local-origin restriction; keep desktop viewport untouched. Add host capability detection so phone explains when a Mac restart is required.
3. Review focused changes. Unit/mobile checks plus real Electron local website form/link/button and real Codex local command verification.
4. Build, deploy phone assets, package/install Mac app. Preserve user running terminals; do not restart active Luce or shared Codex daemon. Tell user if Mac restart is required for new browser controls.

Ownership:
- Submission implementer: remote-actions submit/state capabilities, mobile sendText only, submission tests and remote-smoke terminal sections.
- Preview implementer: remote-preview, remote-actions preview cases only, mobile preview functions/HTML/CSS, preview tests and remote-smoke preview sections.
- Root: review, coordination, build/deploy/install and evidence.

Implementation decisions and evidence:
- Real Codex 0.160.0 treats a text/Enter burst as paste; the production wrapped CLI regression submits `/status` with a separate Enter and no inference. Host submit waits 250ms; older-host compatibility is used only after an explicit unsupported-operation reply and rechecks terminal state before Enter.
- Phone/Desktop refer to viewport size. Both use independent offscreen browsers; neither borrows the native Mac preview. Capability omission in same-connection state pushes retains flags, while reconnect resets them until the new host confirms support.
- Preview frames are bound to terminal/mode/generation, decoded before use, and pointer input waits for a fresh frame after page-changing actions. Captures wait for pending actions in their own terminal/mode.
- Unit suite passed 65/65; phone smoke and real wrapped Codex submission passed. Initial deployed Electron form test exposed missing Enter behavior in the browser key handling; fix and fresh integration verification are required before installation/completion.

Completed verification and delivery:
- Hidden browser keys now use bounded CDP dispatch rather than OS-focus-dependent sendInputEvent. Enter includes the character event; full key sequences serialize per WebContents. The real fixture verifies Backspace, Tab, Escape, and Enter form submission.
- Real wheel tests proved native Electron deltas have the opposite sign to DOM wheel/phone gesture deltas. Backend maps both axes accordingly; original +220-down / -220-up fixture now passes.
- Final unit suite 67/67, mobile smoke, real Codex `/status` wrapped submit, and packaged Electron with deployed Cloudflare phone integration pass. The fixture exercises real PTY Send/Enter, all browser keys/form entry, scroll both ways, route Back/Forward/Reload, native Mac preview isolation, Claude/Codex approval fixtures, pairing and revocation. No model prompts submitted.
- Phone assets deployed as Worker version 12eccafd-5313-4dcc-9f62-f90cba3162d4. Installed /Users/fedepoi/Applications/Luce.app; backup /Users/fedepoi/Applications/Luce-backup-1790960501868.app. Installed deep/strict signature, source/archive hashes, and live asset hashes pass.
- Current user's Luce process and shared Codex daemon were not stopped. Refresh phone for Send/Enter; restart Luce after ongoing work to load advanced preview controls. Pairing remains in the original profile.

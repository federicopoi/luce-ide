# Preview context and sidebar polish

User approved implementation: previews should move the source chat to the left in place of projects/conversations, use the remaining width for preview, and Back restore the original workspace. Match Codex reference with quiet rounded selection, consistent folder outlines, denser hierarchy and restrained metadata. Preserve project layout, focused state, sidebar visibility/width, xterm process/scrollback, and file state.

- [x] Write Electron regression covering actual URL click, browser bounds, live source terminal at left, Back restoring two panes/collapsed preferences, file preview, resize and no-source full preview.
- [x] Add preview-context aside and draggable separator; reparent existing xterm node without spawning/disposing, keep terminal interactive, hide navigation temporarily using CSS. Browser bounds follow right surface.
- [x] Refine folder/project/file row spacing, indentation/guide lines, SVG chevrons, subtle selected states, filter/footer chrome. Preserve tree ARIA and keyboard/drag behavior.
- [x] Verify screenshots and regressions, request review, build/install together with GitHub feature.

Verification: npm test → 124/124 pass; general app, Codex accounts, GitHub profiles/relaunch, Codex continuation GitHub pinning, files/media/cwd/drag/link, and preview-context smokes pass. Review findings fixed and rechecked. Explicit GitHub profiles are scoped to github.com; Enterprise/custom SSH keeps Existing setup. Real browser authorization remains a user action.

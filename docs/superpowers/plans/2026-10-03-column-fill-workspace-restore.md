# Column fill and workspace restore

Authorized scope: fill one empty vertical mate in a four-pane workspace; preserve the other column and running PTYs. On relaunch restore saved agent conversations/accounts/folders, selected project and renderer positions, splits, filled columns and active/focused view. Shells restart fresh, without replaying commands. Auto starts off as before. Missing histories/accounts are skipped with a notice, never force-steal another app's session.

1. Add occupancy-checked column-fill helper, header/menu toggle, grid spans and partial row divider. Exercise three real shells, restore, resize, reload and occupied-mate safeguards.
2. Add a private atomic bounded workspace session record; save before shutdown and debounce metadata updates, suppress writes while restoring/disposal. Restore through validated terminal factory after history/account initialization, map old runtime IDs to new IDs.
3. Persist renderer slot/active/focus/preview state and migrate restored IDs, including filled columns; hydrate only once restoration ends. Retain existing project/sidebar/tab/split state.
4. Test parser/private snapshot/restore failure isolation plus real Electron quit/relaunch with shells and saved agent fixtures. Run unit/resize/column/relaunch checks, review, build/package and staged install without touching user sessions.

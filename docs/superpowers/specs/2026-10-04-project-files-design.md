# Project files and workspace reliability

Approved in conversation: file icon beside the project path, a resizable file sidebar alongside Conversations, in-workspace text/image/video previews, drag paths into terminals, and per-project sidebar visibility. Preserve focused terminal views across project switches and relaunch. Investigate failed agent restores using actual saved metadata.

The main process owns filesystem access. Resolve all browse/preview paths against the selected project root, reject escaping paths and symlinks, and never execute file content. List one directory at a time; folders first, natural sorting, hidden-file toggle, refresh. Keep large dependency folders collapsed until explicitly opened. Read text up to 1 MiB, identify binary/oversized/unsupported content, and serve media through a restricted application protocol supporting streaming and seeking. The renderer owns a dedicated tree module and a preview panel over the workspace with a Back to terminal action. Terminal processes continue while previews are open. Dragging inserts a shell-quoted path and never submits it.

Keep open/expanded tree state per project and persist panel width. Use existing Luce colors, spacing, icons, accessible names, keyboard tree navigation, and resize conventions. Prevent stale asynchronous folder/preview results from appearing after project switches. Retain native website preview behavior.

Workspace reliability: keep focus in each project arrangement, map old terminal IDs on relaunch, and clear focus only on explicit layout/new-terminal changes. Recover indexed-out saved sessions only from validated same-account transcripts with verified identity and working folder; never invent another conversation. Preserve failed restore records for retry, with useful per-session diagnostics.

Validation: behavioral filesystem tests for traversal/symlinks, sorting, bounded text and media; real Electron browsing/image/video/drag/resize checks; project switch and relaunch checks with saved and unindexed histories; complete unit suite and existing workspace smoke. Package and verify the installed signature. Preserve the user’s existing edits and running terminals.

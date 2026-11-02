# Changelog

## 0.1.0 (2026-10-26)

- Initial release: labelled core subset of the documented surface.
- CLI: `hostpanel flux <action> [subaction] [--params <json>]`,
  `hostpanel scout <action> [subaction] [--params <json>]`,
  `hostpanel help`, and `hostpanel mcp`.
- MCP server (`hostpanel mcp`, stdio) with two action-router tools:
  `flux` (docker info/version, container list/inspect, host info,
  compose list, help) and `scout` (nodes, exec, find, zfs pools,
  logs journal, help).
- Execution goes through an injectable executor using argv arrays
  only (execFile semantics, never a shell); only the local host
  target is served in this subset.
- `scout exec` is restricted to the 18 documented allowlisted read
  commands and refuses any other command before execution.

# hostpanel

hostpanel looks after a single host: Docker daemon and container
state, Compose projects, basic host information, file search, ZFS
pools, and journal logs. It exposes all of that through two
action-router tools, `flux` and `scout`, and the same two routers
on the command line. One binary serves both faces.

This is a labelled core subset of a larger documented surface.
The implemented actions are listed below; every other documented
action is omitted from this subset and is named in the build
report and in the spec fixture, not silently dropped.

Only the local host is served. A `host` parameter, when supplied,
must be `local`; remote SSH targets are not part of this subset.
Processes are started with an argument array only — no command
string ever goes through a shell.

## Install

```bash
npx @reneturcios/hostpanel help
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/hostpanel
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead, and mount the Docker socket
if you want the flux actions to reach a real daemon.

## CLI

```bash
hostpanel flux docker info
hostpanel flux docker version
hostpanel flux container list --params '{"state":"running"}'
hostpanel flux container inspect --params '{"container_id":"abc123"}'
hostpanel flux host info
hostpanel flux compose list

hostpanel scout nodes
hostpanel scout exec --params '{"command":"hostname"}'
hostpanel scout exec --params '{"command":"cat","args":["/etc/hostname"]}'
hostpanel scout find --params '{"path":"/srv","pattern":"*.log","limit":20}'
hostpanel scout zfs pools
hostpanel scout logs journal --params '{"unit":"docker","lines":50}'

hostpanel help
hostpanel --version
```

Successful calls print a JSON object with the `argv` that ran and
its captured `stdout`, `stderr`, and `exitCode`; `nodes` and the
`help` actions print their local answers directly. Exit codes:
`0` on success, `1` when a call fails (including a refused
command or a non-zero child exit), `2` for usage errors.

## MCP server

```bash
npx -y @reneturcios/hostpanel mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "hostpanel": {
      "command": "npx",
      "args": ["-y", "@reneturcios/hostpanel", "mcp"]
    }
  }
}
```

### Tools

Both tools take a required `action`, an optional `subaction`, and
an optional `params` object. Parameter names inside `params`
follow the original per-action tables (`host`, `container_id`,
`state`, `name_filter`, `image_filter`, `label_filter`, `path`,
`pattern`, `depth`, `limit`, `command`, `args`, `pool`, `lines`,
`unit`, `priority`, `since`, `until`, `grep`).

| Tool | Action | Subaction | What it does |
| --- | --- | --- | --- |
| `flux` | `docker` | `info` | Docker daemon information (`docker info`). |
| `flux` | `docker` | `version` | Docker version (`docker version`). |
| `flux` | `container` | `list` | List containers (`docker ps`), with optional state/name/image/label filters. |
| `flux` | `container` | `inspect` | Inspect one container (`docker inspect`); requires `container_id`. |
| `flux` | `host` | `info` | OS, kernel, and architecture (`uname -a`). |
| `flux` | `compose` | `list` | List Compose projects (`docker compose ls`). |
| `flux` | `help` | — | The flux action reference, answered locally. |
| `scout` | `nodes` | — | The configured hosts: just `local` in this subset. |
| `scout` | `exec` | — | Run one allowlisted read command; requires `command`, optional `args`. |
| `scout` | `find` | — | Find files by glob (`find <path> -name <pattern>`); requires `path` and `pattern`. |
| `scout` | `zfs` | `pools` | List ZFS pools (`zpool list`), optional `pool` filter. |
| `scout` | `logs` | `journal` | Read the systemd journal (`journalctl`), with optional lines/unit/priority/since/until/grep. |
| `scout` | `help` | — | The scout action reference, answered locally. |

### The exec allowlist

`scout exec` runs read-only inspection commands only. The full
allowlist is 18 commands: `cat`, `head`, `tail`, `grep`, `rg`,
`ls`, `tree`, `wc`, `uniq`, `diff`, `stat`, `file`, `du`, `df`,
`pwd`, `hostname`, `uptime`, and `whoami`. Anything else —
including `git`, shells, interpreters, and mutating tools — is
refused before any process starts. The command must be a single
name; arguments travel separately in the `args` array and are
passed as argv, never interpolated into a shell string.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, fake executor only
npm run dev     # run the CLI from source via tsx
```

Tests inject a fake executor, so the suite records the argv each
action would run and proves refused commands never reach the
executor. No Docker daemon, ZFS pool, or journal is needed — and
no live host result is claimed by the test suite.

## License

MIT — see `LICENSE`.

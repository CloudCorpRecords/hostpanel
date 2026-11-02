# hostpanel — Build Report

MCP Rebuild 1000, Tranche #101+ Batch 5. Clean-room rebuild of
dinglebear-ai/synapse (rank 179, 2 stars), built from the public
README spec captured in
`harness/fixtures/synapse-tools-original.json`. That fixture is
docs-derived and labelled a LABELLED CORE SUBSET: the 2 tools are
the full documented set, the implemented actions are the subset
named below, and every omitted documented action is listed in the
fixture `_source`. No original server was probed. Parity proves
the rebuild matches this program's defined spec, labelled
docs-derived. Local build only — nothing pushed or published.

Identity: repo `hostpanel`, npm `@reneturcios/hostpanel`,
MCP name `io.github.CloudCorpRecords/hostpanel`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `hostpanel: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Host, Docker, Compose, SSH, logs
  and ZFS operations via two action-router tools." = **80 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/hostpanel:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/hostpanel"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`flux <action> [subaction]`,
  `scout <action> [subaction]`, both with `--params <json>`;
  `help`, `mcp`, `--version`; exit 2 usage / 1 execution error),
  `src/mcp.ts`, `src/types.ts`, `src/hostpanel.ts` (core logic,
  `VERSION = "0.1.0"`)
- `test/hostpanel.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to hostpanel)

Fixture created first:
`~/workspace/mcp-rebuild-100/harness/fixtures/synapse-tools-original.json`
— 2 tools (`flux`, `scout`), `_source` labelling the spec
docs-derived LABELLED CORE SUBSET with all omitted actions listed.

## Tools implemented (2, both action routers)

Router shape for both tools (per the documented action/subaction
dispatch): required `action`, optional `subaction`, optional
`params` object; per-action parameter names inside `params` follow
the README tables.

Documented original surface: flux 42 grouped actions (docker 9 /
container 14 / host 9 / compose 10) plus help; scout 9 simple
actions + zfs 3 subactions + logs 4 subactions, plus help.

Implemented subset:

- `flux` — docker `info`, docker `version`; container `list`,
  container `inspect`; host `info`; compose `list`; `help`.
  (6 executor-backed routes + help. `version` is the companion
  subaction specified for this rebuild alongside docker `info`,
  implemented via `docker version`; it is not counted in the 42
  documented grouped actions.)
- `scout` — `nodes`, `exec`, `find`; zfs `pools`; logs `journal`;
  `help`. (5 routes + help; `nodes` and `help` are answered
  locally with no execution.)

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: the
  high-level helper's zod-to-JSON-Schema conversion injects
  `$schema` / `additionalProperties` keys absent from the defined
  spec and breaks exact schema parity. Zod still validates every
  `tools/call` (action enums for both routers).
- Execution goes through an injectable `ExecutorFn`
  (`src/types.ts`): a file name plus an argv array, run by the
  default executor with `execFile` — never a shell string. The
  test suite injects a fake executor that records argv; no live
  Docker, SSH, ZFS, or journal is used or claimed in tests.
- Executor argv per route — flux: docker info → `docker info`;
  docker version → `docker version`; container list →
  `docker ps` (state `all` → `-a`, otherwise
  `--filter status=<state>`; plus `--filter name=` / `ancestor=` /
  `label=` for name/image/label filters); container inspect →
  `docker inspect <container_id>` (container_id required and
  token-validated before execution); host info → `uname -a`;
  compose list → `docker compose ls`. Scout: find →
  `find <path> [-maxdepth <depth>] -name <pattern>` (output lines
  truncated to `limit` when supplied); zfs pools →
  `zpool list [<pool>]`; logs journal →
  `journalctl --no-pager -n <lines, default 100>` plus `-u`,
  `-p`, `--since`, `--until`, `--grep` when supplied.
- Local-only hosts: a `host` param, when supplied, must be
  exactly `local`; any other value is refused before execution.
  Remote SSH targets are an omitted part of the subset, stated
  in the error text, the README, and the core header.
- `scout exec` allowlist: exactly the 18 documented read commands
  (`cat`, `head`, `tail`, `grep`, `rg`, `ls`, `tree`, `wc`,
  `uniq`, `diff`, `stat`, `file`, `du`, `df`, `pwd`, `hostname`,
  `uptime`, `whoami`). The command must be a single name (no
  whitespace, `/`, or `;`); arguments travel in the separate
  `args` array and are passed as argv. `git` is deliberately not
  allowlisted, matching the README. Any other command is refused
  BEFORE the executor is called — spy-proven in tests (executor
  call count stays 0 for `rm`, `git`, `bash`, a space-joined
  command, a `;`-joined command, and a path-qualified command).
- Non-zero child exits surface the full argv plus the captured
  stderr/stdout detail. Successful executor routes return
  `{argv, stdout, stderr, exitCode}` with output trimmed.
- `scout exec` params `path` and `timeout_secs` are accepted and
  type-checked per the documented spec; the executor surface in
  this subset carries neither a working directory nor a timeout,
  which is stated in the core code, not hidden.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo tsc_exit=$?
tsc_exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 23
ℹ pass 23
ℹ fail 0
```
Covers: allowlist exactness (18 commands; git/rm/sh excluded);
flux argv for docker info, docker version, container list
(default, state/name/image/label filters, state=all), container
inspect, host info, compose list; inspect missing/invalid
container_id refused with zero executor calls; flux help local
with zero calls; unknown flux action and omitted subactions
(docker df, container exec) refused with zero calls; non-local
host refused with zero calls; non-zero exit surfacing; scout
nodes local with zero calls; exec argv for allowed commands;
**exec allowlist refusal: non-allowlisted `rm` refused before
the executor is called (spy count 0)**, plus git/bash/space/`;`/
path-shaped refusals all at spy count 0; exec missing command,
bad args shape, and non-local host all at spy count 0; find argv
with depth and limit truncation, and missing path/pattern at
spy count 0; zpool list with and without pool filter and the
omitted zfs datasets subaction refused; journalctl argv with
defaults and with unit/priority/since/grep, invalid lines and
the omitted logs syslog subaction refused; scout help local;
formatPayload.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with
Usage; `scout nodes` → the local host object (exit 0);
`scout exec --params '{"command":"rm","args":["-rf","/"]}'` →
refused with the allowlist error (exit 1, nothing executed).
MCP `initialize` over stdio → `serverInfo:
{"name":"hostpanel","version":"0.1.0"}`; `tools/list` returned
exactly the 2 fixture tools; a stdio `tools/call` for `scout`
with `{action:"help"}` returned the scout reference including
the 18-command allowlist. No live Docker/ZFS/journal result is
claimed from smoke: the only call exercised was the local help
route.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/synapse-tools-original.json \
    --rebuild "stdio:node .../builds/hostpanel/dist/cli.js mcp" \
    --out .../builds/hostpanel/parity-out
verdict=PASS parity_pct=100.0 original_tools=2 rebuild_tools=2 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 2/2.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`), offline
`npm install --package-lock-only --ignore-scripts`, verified after
generation — parses as JSON, top-level `name` is
`@reneturcios/hostpanel`, version `0.1.0`, `lockfileVersion` 3,
**128 package entries** — then only the lockfile was copied back.
Local `node_modules` is a sibling copy (fxrates) used only for
the local build/test; it is not part of the lockfile generation.

## Gaps / honest notes

- Labelled core subset, by design: 5 of the 42 documented flux
  grouped actions are implemented (docker info, container list,
  container inspect, host info, compose list) plus the specified
  docker version companion and flux help; 37 documented flux
  actions are omitted. 5 of the 16 documented scout grouped
  actions are implemented (nodes, exec, find, zfs pools, logs
  journal) plus scout help; 11 documented scout actions are
  omitted. Every omitted action is listed by name in the fixture
  `_source`, the core header, and the README's subset note.
  Calling an omitted action errors with the subset's valid
  options instead of pretending to serve it.
- Docs-derived spec: the argument schemas are documented
  reconstructions in the action-router shape from the README's
  dispatch examples and per-action tables — no original synapse
  server was probed, so parity proves the rebuild matches this
  program's defined spec, not a hand-probed original. The
  original's exact per-action params object layout (its examples
  flatten fields at the top level) is represented here by the
  router's `params` object, a documented local choice.
- No live host claimed: all executor routes are fake-executor
  tested only for argv shape and result handling. Real Docker
  daemon output, `zpool list` output on a ZFS host, and
  `journalctl` output are unverified until a publish-wave smoke
  on a real host; executor stdout is returned trimmed and
  unparsed, so upstream text drift cannot corrupt a parsed shape.
- Remote SSH is omitted entirely in this subset (local host
  only); the original's SSH host discovery, known-hosts handling,
  multi-host `emit`, and root-confined `beam` transfer are not
  reproduced.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.

/**
 * hostpanel core: two action-router tools, `flux` and `scout`, in a
 * labelled core subset of the documented synapse surface.
 *
 * Documented original surface (README "Tools and Actions"):
 *   flux  — 42 grouped actions: docker 9, container 14, host 9,
 *           compose 10, plus help.
 *   scout — 9 simple actions, zfs 3 subactions, logs 4 subactions,
 *           plus help.
 *
 * Implemented in this subset:
 *   flux:  docker info, docker version, container list,
 *          container inspect, host info, compose list, help.
 *   scout: nodes, exec (allowlisted read commands only), find,
 *          zfs pools, logs journal, help.
 *
 * Every other documented action is omitted from this subset and
 * is listed in the fixture `_source` (docker df/images/networks/
 * volumes/pull/build/rmi/prune; container logs/stats/top/search/
 * start/stop/restart/pause/resume/pull/recreate/exec; host status/
 * uptime/resources/services/network/mounts/ports/doctor; compose
 * status/up/down/restart/recreate/logs/build/pull/refresh; scout
 * peek/ps/df/delta/emit/beam; zfs datasets/snapshots; logs syslog/
 * dmesg/auth). Calling an omitted action or subaction errors with
 * the subset's valid options, before any execution.
 *
 * Execution model:
 * - All process execution goes through an injectable ExecutorFn
 *   that receives a file name plus an argv array (execFile
 *   semantics). No shell string is ever built or run.
 * - Only the `local` host target is supported in this subset: a
 *   `host` param, when supplied, must be exactly "local"; any
 *   other value is refused before execution. Remote SSH shaping
 *   is therefore a documented omission, not a hidden behaviour.
 * - `scout exec` accepts only the 18 allowlisted read commands in
 *   ALLOWED_READ_COMMANDS (the README's ALLOWED_READ_COMMANDS set,
 *   which deliberately excludes git, shells, interpreters, network
 *   clients, and mutating tools). Any other command is refused
 *   BEFORE the executor is called.
 * - `help` and `nodes` are answered locally with no execution.
 */
import { execFile } from "node:child_process";
import type { ActionInfo, ExecOutcome, ExecResult, ExecutorFn, RouterArgs } from "./types.js";

export const VERSION = "0.1.0";

export const FLUX_ACTIONS = ["docker", "container", "host", "compose", "help"] as const;
export const SCOUT_ACTIONS = ["nodes", "exec", "find", "zfs", "logs", "help"] as const;

export const FLUX_SUBACTIONS: Record<string, string[]> = {
  docker: ["info", "version"],
  container: ["list", "inspect"],
  host: ["info"],
  compose: ["list"],
  help: [],
};

export const SCOUT_SUBACTIONS: Record<string, string[]> = {
  zfs: ["pools"],
  logs: ["journal"],
};

/** The 18 allowlisted read commands for scout exec. */
export const ALLOWED_READ_COMMANDS = [
  "cat",
  "head",
  "tail",
  "grep",
  "rg",
  "ls",
  "tree",
  "wc",
  "uniq",
  "diff",
  "stat",
  "file",
  "du",
  "df",
  "pwd",
  "hostname",
  "uptime",
  "whoami",
] as const;

export function isAllowedReadCommand(value: string): boolean {
  return (ALLOWED_READ_COMMANDS as readonly string[]).includes(value);
}

/** Real executor: execFile with an argv array, never a shell. */
export function createDefaultExecutor(): ExecutorFn {
  return (file: string, args: string[]) =>
    new Promise<ExecResult>((resolve) => {
      execFile(file, args, { maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code: number }).code as number)
            : err
              ? 1
              : 0;
        resolve({
          stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
          stderr:
            typeof stderr === "string" && stderr
              ? stderr
              : err && code === 0
                ? ""
                : err
                  ? err.message
                  : "",
          exitCode: code,
        });
      });
    });
}

function trim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function paramsOf(args: RouterArgs): Record<string, unknown> {
  return args.params ?? {};
}

function paramString(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new Error(`${key} must be a string`);
  const t = v.trim();
  return t ? t : undefined;
}

function requireParam(params: Record<string, unknown>, key: string): string {
  const v = paramString(params, key);
  if (!v) throw new Error(`${key} is required`);
  return v;
}

function paramPositiveInt(
  params: Record<string, unknown>,
  key: string,
): number | undefined {
  const v = params[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return v;
}

/** Only the local host exists in this subset. Refuses before execution. */
export function resolveHost(params: Record<string, unknown>): string {
  const host = paramString(params, "host") ?? "local";
  if (host !== "local") {
    throw new Error(
      `Only the local host is supported in this subset (got "${host}"); remote SSH hosts are omitted from this labelled core subset`,
    );
  }
  return host;
}

function requireToken(value: string, field: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.\-]*$/.test(value)) {
    throw new Error(`${field} is invalid: "${value}"`);
  }
  return value;
}

async function run(executor: ExecutorFn, file: string, args: string[]): Promise<ExecOutcome> {
  const result = await executor(file, args);
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.exitCode !== 0) {
    const detail = (stderr || stdout).trim();
    throw new Error(
      `Command failed (${[file, ...args].join(" ")}) with exit code ${result.exitCode}${detail ? `: ${detail}` : ""}`,
    );
  }
  return { argv: [file, ...args], stdout: stdout.trim(), stderr: stderr.trim(), exitCode: result.exitCode };
}

/** Built-in flux documentation returned by the help action. */
export function getFluxHelp(): { tool: string; actions: ActionInfo[]; subset: string } {
  return {
    tool: "flux",
    actions: [
      { action: "docker", subactions: ["info", "version"], description: "Docker daemon information and version." },
      { action: "container", subactions: ["list", "inspect"], description: "List containers and inspect one container." },
      { action: "host", subactions: ["info"], description: "Host OS, kernel, and architecture information." },
      { action: "compose", subactions: ["list"], description: "List Docker Compose projects." },
      { action: "help", subactions: [], description: "Return this flux action reference." },
    ],
    subset: "Labelled core subset: all other documented flux actions are omitted (see fixture _source).",
  };
}

/** Built-in scout documentation returned by the help action. */
export function getScoutHelp(): {
  tool: string;
  actions: ActionInfo[];
  allowed_read_commands: string[];
  subset: string;
} {
  return {
    tool: "scout",
    actions: [
      { action: "nodes", subactions: [], description: "List configured hosts (local only in this subset)." },
      { action: "exec", subactions: [], description: "Execute an allowlisted read command (argv only, no shell)." },
      { action: "find", subactions: [], description: "Find files by glob under a path." },
      { action: "zfs", subactions: ["pools"], description: "List ZFS pools." },
      { action: "logs", subactions: ["journal"], description: "Read the systemd journal." },
      { action: "help", subactions: [], description: "Return this scout action reference." },
    ],
    allowed_read_commands: [...ALLOWED_READ_COMMANDS],
    subset: "Labelled core subset: all other documented scout actions are omitted (see fixture _source).",
  };
}

function requireSubaction(
  tool: string,
  action: string,
  subaction: string | undefined,
  valid: string[],
): string {
  const s = trim(subaction ?? "");
  if (!s || !valid.includes(s)) {
    throw new Error(
      `Unknown subaction: ${s ? `"${s}"` : "(missing)"} for ${tool} action "${action}". Valid subactions in this subset: ${valid.join(", ")}`,
    );
  }
  return s;
}

function rejectSubaction(tool: string, action: string, subaction: string | undefined): void {
  const s = trim(subaction ?? "");
  if (s) {
    throw new Error(`${tool} action "${action}" does not take a subaction (got "${s}")`);
  }
}

/** Execute one flux router call through the injected executor. */
export async function runFlux(executor: ExecutorFn, args: RouterArgs): Promise<unknown> {
  const action = trim(args.action);
  if (!(FLUX_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(
      `Unknown action: ${action ? `"${action}"` : "(empty)"}. Valid flux actions: ${FLUX_ACTIONS.join(", ")}`,
    );
  }
  if (action === "help") return getFluxHelp();
  const params = paramsOf(args);
  resolveHost(params);
  if (action === "docker") {
    const sub = requireSubaction("flux", action, args.subaction, FLUX_SUBACTIONS.docker);
    return run(executor, "docker", [sub === "info" ? "info" : "version"]);
  }
  if (action === "container") {
    const sub = requireSubaction("flux", action, args.subaction, FLUX_SUBACTIONS.container);
    if (sub === "list") {
      const argv = ["ps"];
      const state = paramString(params, "state");
      if (state) {
        if (state === "all") argv.push("-a");
        else argv.push("--filter", `status=${state}`);
      }
      const nameFilter = paramString(params, "name_filter");
      if (nameFilter) argv.push("--filter", `name=${nameFilter}`);
      const imageFilter = paramString(params, "image_filter");
      if (imageFilter) argv.push("--filter", `ancestor=${imageFilter}`);
      const labelFilter = paramString(params, "label_filter");
      if (labelFilter) argv.push("--filter", `label=${labelFilter}`);
      return run(executor, "docker", argv);
    }
    const containerId = requireToken(requireParam(params, "container_id"), "container_id");
    return run(executor, "docker", ["inspect", containerId]);
  }
  if (action === "host") {
    requireSubaction("flux", action, args.subaction, FLUX_SUBACTIONS.host);
    return run(executor, "uname", ["-a"]);
  }
  // compose
  requireSubaction("flux", action, args.subaction, FLUX_SUBACTIONS.compose);
  return run(executor, "docker", ["compose", "ls"]);
}

/**
 * Validate a scout exec request and return its argv. Allowlist and
 * shape checks all happen here, before any executor call.
 */
export function buildExecArgv(params: Record<string, unknown>): { file: string; args: string[] } {
  const command = requireParam(params, "command");
  if (command !== command.trim() || /\s/.test(command) || command.includes("/") || command.includes(";")) {
    throw new Error(
      `Command not allowed: "${command}". scout exec takes a single allowlisted command name; allowed read commands: ${ALLOWED_READ_COMMANDS.join(", ")}`,
    );
  }
  if (!isAllowedReadCommand(command)) {
    throw new Error(
      `Command not allowed: "${command}". Allowed read commands: ${ALLOWED_READ_COMMANDS.join(", ")}`,
    );
  }
  const rawArgs = params.args;
  let argvArgs: string[] = [];
  if (rawArgs !== undefined && rawArgs !== null) {
    if (!Array.isArray(rawArgs) || rawArgs.some((a) => typeof a !== "string")) {
      throw new Error("args must be an array of strings");
    }
    argvArgs = rawArgs as string[];
  }
  const timeout = paramPositiveInt(params, "timeout_secs");
  void timeout; // accepted per spec; the executor surface carries no timeout in this subset
  paramString(params, "path"); // accepted per spec (working directory hint); type-checked only
  return { file: command, args: argvArgs };
}

/** Execute one scout router call through the injected executor. */
export async function runScout(executor: ExecutorFn, args: RouterArgs): Promise<unknown> {
  const action = trim(args.action);
  if (!(SCOUT_ACTIONS as readonly string[]).includes(action)) {
    throw new Error(
      `Unknown action: ${action ? `"${action}"` : "(empty)"}. Valid scout actions: ${SCOUT_ACTIONS.join(", ")}`,
    );
  }
  if (action === "help") return getScoutHelp();
  const params = paramsOf(args);
  if (action === "nodes") {
    rejectSubaction("scout", action, args.subaction);
    return { hosts: [{ name: "local", protocol: "local" }] };
  }
  resolveHost(params);
  if (action === "exec") {
    rejectSubaction("scout", action, args.subaction);
    const { file, args: argvArgs } = buildExecArgv(params);
    return run(executor, file, argvArgs);
  }
  if (action === "find") {
    rejectSubaction("scout", action, args.subaction);
    const path = requireParam(params, "path");
    if (path.startsWith("-")) throw new Error(`path is invalid: "${path}"`);
    const pattern = requireParam(params, "pattern");
    const depth = paramPositiveInt(params, "depth");
    const limit = paramPositiveInt(params, "limit");
    const argv: string[] = [path];
    if (depth !== undefined) argv.push("-maxdepth", String(depth));
    argv.push("-name", pattern);
    const out = await run(executor, "find", argv);
    if (limit !== undefined && out.stdout) {
      out.stdout = out.stdout.split("\n").slice(0, limit).join("\n");
    }
    return out;
  }
  if (action === "zfs") {
    requireSubaction("scout", action, args.subaction, SCOUT_SUBACTIONS.zfs);
    const argv = ["list"];
    const pool = paramString(params, "pool");
    if (pool) argv.push(requireToken(pool, "pool"));
    return run(executor, "zpool", argv);
  }
  // logs
  requireSubaction("scout", action, args.subaction, SCOUT_SUBACTIONS.logs);
  const lines = paramPositiveInt(params, "lines") ?? 100;
  const argv: string[] = ["--no-pager", "-n", String(lines)];
  const unit = paramString(params, "unit");
  if (unit) argv.push("-u", requireToken(unit, "unit"));
  const priority = paramString(params, "priority");
  if (priority) argv.push("-p", priority);
  const since = paramString(params, "since");
  if (since) argv.push("--since", since);
  const until = paramString(params, "until");
  if (until) argv.push("--until", until);
  const grep = paramString(params, "grep");
  if (grep) argv.push("--grep", grep);
  return run(executor, "journalctl", argv);
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

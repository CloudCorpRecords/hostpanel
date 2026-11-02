#!/usr/bin/env node
/**
 * hostpanel CLI.
 *
 *   hostpanel flux <action> [subaction] [--params <json>]
 *   hostpanel scout <action> [subaction] [--params <json>]
 *   hostpanel help
 *   hostpanel mcp
 *   hostpanel --version
 *
 * Examples:
 *   hostpanel flux docker info
 *   hostpanel flux container list --params '{"state":"running"}'
 *   hostpanel flux container inspect --params '{"container_id":"abc123"}'
 *   hostpanel flux host info
 *   hostpanel flux compose list
 *   hostpanel scout nodes
 *   hostpanel scout exec --params '{"command":"hostname"}'
 *   hostpanel scout find --params '{"path":"/srv","pattern":"*.log"}'
 *   hostpanel scout zfs pools
 *   hostpanel scout logs journal --params '{"unit":"docker"}'
 *
 * Only the local host is served in this subset. Execution uses
 * argv arrays only, never a shell.
 * Exit codes: 0 success, 1 execution error, 2 usage error.
 */
import {
  createDefaultExecutor,
  formatPayload,
  getFluxHelp,
  getScoutHelp,
  runFlux,
  runScout,
  VERSION,
} from "./hostpanel.js";

function usage(): never {
  console.error(`Usage:
  hostpanel flux <action> [subaction] [--params <json>]
  hostpanel scout <action> [subaction] [--params <json>]
  hostpanel help
  hostpanel mcp
  hostpanel --version`);
  process.exit(2);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(formatPayload({ flux: getFluxHelp(), scout: getScoutHelp() }));
    return;
  }
  if (cmd !== "flux" && cmd !== "scout") usage();
  const action = rest[0];
  if (!action) usage();
  let subaction: string | undefined;
  const flags: string[] = [];
  for (const token of rest.slice(1)) {
    if (token === "--params" || flags.length > 0 || token.startsWith("--")) {
      flags.push(token);
    } else if (subaction === undefined) {
      subaction = token;
    } else {
      usage();
    }
  }
  let params: Record<string, unknown> | undefined;
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === "--params") {
      const raw = flags[++i];
      if (!raw) usage();
      try {
        params = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        console.error("error: --params must be valid JSON");
        process.exit(2);
      }
    } else {
      usage();
    }
  }
  const executor = createDefaultExecutor();
  try {
    const out =
      cmd === "flux"
        ? await runFlux(executor, { action, subaction, params })
        : await runScout(executor, { action, subaction, params });
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();

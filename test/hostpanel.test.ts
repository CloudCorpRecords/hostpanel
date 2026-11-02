import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_READ_COMMANDS,
  buildExecArgv,
  formatPayload,
  getFluxHelp,
  getScoutHelp,
  isAllowedReadCommand,
  runFlux,
  runScout,
} from "../src/hostpanel.js";
import type { ExecResult, ExecutorFn } from "../src/types.js";

interface Captured {
  calls: Array<{ file: string; args: string[] }>;
}

function fakeExecutor(
  captured: Captured,
  result: Partial<ExecResult> = {},
): ExecutorFn {
  return async (file: string, args: string[]) => {
    captured.calls.push({ file, args: [...args] });
    return { stdout: "ok-output", stderr: "", exitCode: 0, ...result };
  };
}

function fresh(): { c: Captured; exec: ExecutorFn } {
  const c: Captured = { calls: [] };
  return { c, exec: fakeExecutor(c) };
}

describe("allowlist", () => {
  it("is exactly the 18 documented read commands", () => {
    assert.deepEqual([...ALLOWED_READ_COMMANDS], [
      "cat", "head", "tail", "grep", "rg", "ls", "tree", "wc", "uniq",
      "diff", "stat", "file", "du", "df", "pwd", "hostname", "uptime", "whoami",
    ]);
    assert.equal(isAllowedReadCommand("git"), false);
    assert.equal(isAllowedReadCommand("rm"), false);
    assert.equal(isAllowedReadCommand("sh"), false);
  });

  it("buildExecArgv shapes an allowed command with args", () => {
    assert.deepEqual(buildExecArgv({ command: "grep", args: ["-n", "x", "/f"] }), {
      file: "grep",
      args: ["-n", "x", "/f"],
    });
  });
});

describe("flux", () => {
  it("docker info runs docker info", async () => {
    const { c, exec } = fresh();
    const out = (await runFlux(exec, { action: "docker", subaction: "info" })) as { argv: string[]; stdout: string };
    assert.deepEqual(c.calls, [{ file: "docker", args: ["info"] }]);
    assert.deepEqual(out.argv, ["docker", "info"]);
    assert.equal(out.stdout, "ok-output");
  });

  it("docker version runs docker version", async () => {
    const { c, exec } = fresh();
    await runFlux(exec, { action: "docker", subaction: "version" });
    assert.deepEqual(c.calls, [{ file: "docker", args: ["version"] }]);
  });

  it("container list defaults to docker ps, filters compose argv", async () => {
    const a = fresh();
    await runFlux(a.exec, { action: "container", subaction: "list" });
    assert.deepEqual(a.c.calls, [{ file: "docker", args: ["ps"] }]);
    const b = fresh();
    await runFlux(b.exec, {
      action: "container",
      subaction: "list",
      params: { state: "running", name_filter: "web", image_filter: "nginx", label_filter: "app=web" },
    });
    assert.deepEqual(b.c.calls, [{
      file: "docker",
      args: ["ps", "--filter", "status=running", "--filter", "name=web", "--filter", "ancestor=nginx", "--filter", "label=app=web"],
    }]);
    const d = fresh();
    await runFlux(d.exec, { action: "container", subaction: "list", params: { state: "all" } });
    assert.deepEqual(d.c.calls, [{ file: "docker", args: ["ps", "-a"] }]);
  });

  it("container inspect requires a valid container_id before execution", async () => {
    const { c, exec } = fresh();
    await runFlux(exec, { action: "container", subaction: "inspect", params: { container_id: "abc123" } });
    assert.deepEqual(c.calls, [{ file: "docker", args: ["inspect", "abc123"] }]);
    const bad = fresh();
    await assert.rejects(
      () => runFlux(bad.exec, { action: "container", subaction: "inspect", params: {} }),
      /container_id is required/,
    );
    await assert.rejects(
      () => runFlux(bad.exec, { action: "container", subaction: "inspect", params: { container_id: "--help" } }),
      /container_id is invalid/,
    );
    assert.equal(bad.c.calls.length, 0);
  });

  it("host info runs uname -a; compose list runs docker compose ls", async () => {
    const a = fresh();
    await runFlux(a.exec, { action: "host", subaction: "info" });
    assert.deepEqual(a.c.calls, [{ file: "uname", args: ["-a"] }]);
    const b = fresh();
    await runFlux(b.exec, { action: "compose", subaction: "list" });
    assert.deepEqual(b.c.calls, [{ file: "docker", args: ["compose", "ls"] }]);
  });

  it("help is local and lists the subset", async () => {
    const { c, exec } = fresh();
    const out = (await runFlux(exec, { action: "help" })) as { actions: Array<{ action: string }> };
    assert.equal(c.calls.length, 0);
    assert.deepEqual(out.actions.map((x) => x.action), ["docker", "container", "host", "compose", "help"]);
    assert.deepEqual(getFluxHelp().actions.length, 5);
  });

  it("unknown action and omitted subactions error before execution", async () => {
    const { c, exec } = fresh();
    await assert.rejects(() => runFlux(exec, { action: "nope" }), /Unknown action/);
    await assert.rejects(() => runFlux(exec, { action: "docker", subaction: "df" }), /Valid subactions in this subset: info, version/);
    await assert.rejects(() => runFlux(exec, { action: "container", subaction: "exec" }), /Valid subactions/);
    await assert.rejects(() => runFlux(exec, { action: "docker" }), /subaction/);
    assert.equal(c.calls.length, 0);
  });

  it("non-local host is refused before execution", async () => {
    const { c, exec } = fresh();
    await assert.rejects(
      () => runFlux(exec, { action: "docker", subaction: "info", params: { host: "myhost" } }),
      /Only the local host is supported/,
    );
    assert.equal(c.calls.length, 0);
  });

  it("non-zero exit surfaces the command and stderr", async () => {
    const c: Captured = { calls: [] };
    const exec = fakeExecutor(c, { stdout: "", stderr: "daemon down", exitCode: 1 });
    await assert.rejects(() => runFlux(exec, { action: "docker", subaction: "info" }), /docker info.*daemon down/);
  });
});

describe("scout", () => {
  it("nodes returns only the local host, with no execution", async () => {
    const { c, exec } = fresh();
    const out = await runScout(exec, { action: "nodes" });
    assert.equal(c.calls.length, 0);
    assert.deepEqual(out, { hosts: [{ name: "local", protocol: "local" }] });
  });

  it("exec runs an allowlisted command with argv args", async () => {
    const { c, exec } = fresh();
    await runScout(exec, { action: "exec", params: { command: "hostname" } });
    assert.deepEqual(c.calls, [{ file: "hostname", args: [] }]);
    const b = fresh();
    await runScout(b.exec, { action: "exec", params: { command: "cat", args: ["/etc/hostname"] } });
    assert.deepEqual(b.c.calls, [{ file: "cat", args: ["/etc/hostname"] }]);
  });

  it("exec refuses a non-allowlisted command BEFORE the executor is called", async () => {
    const { c, exec } = fresh();
    await assert.rejects(
      () => runScout(exec, { action: "exec", params: { command: "rm", args: ["-rf", "/"] } }),
      /Command not allowed: "rm"/,
    );
    assert.equal(c.calls.length, 0);
  });

  it("exec refuses git, shells, and shell-shaped commands before execution", async () => {
    const { c, exec } = fresh();
    await assert.rejects(() => runScout(exec, { action: "exec", params: { command: "git" } }), /not allowed/);
    await assert.rejects(() => runScout(exec, { action: "exec", params: { command: "bash" } }), /not allowed/);
    await assert.rejects(() => runScout(exec, { action: "exec", params: { command: "cat /etc/passwd" } }), /not allowed/);
    await assert.rejects(() => runScout(exec, { action: "exec", params: { command: "cat;rm" } }), /not allowed/);
    await assert.rejects(() => runScout(exec, { action: "exec", params: { command: "/bin/cat" } }), /not allowed/);
    assert.equal(c.calls.length, 0);
  });

  it("exec validates command presence and args shape before execution", async () => {
    const { c, exec } = fresh();
    await assert.rejects(() => runScout(exec, { action: "exec", params: {} }), /command is required/);
    await assert.rejects(
      () => runScout(exec, { action: "exec", params: { command: "cat", args: [42] } }),
      /args must be an array of strings/,
    );
    await assert.rejects(
      () => runScout(exec, { action: "exec", params: { host: "remote1", command: "hostname" } }),
      /Only the local host/,
    );
    assert.equal(c.calls.length, 0);
  });

  it("find composes find argv with depth and truncates to limit", async () => {
    const c: Captured = { calls: [] };
    const exec = fakeExecutor(c, { stdout: "/a/x.log\n/a/y.log\n/a/z.log" });
    const out = (await runScout(exec, {
      action: "find",
      params: { path: "/srv", pattern: "*.log", depth: 2, limit: 2 },
    })) as { stdout: string };
    assert.deepEqual(c.calls, [{ file: "find", args: ["/srv", "-maxdepth", "2", "-name", "*.log"] }]);
    assert.equal(out.stdout, "/a/x.log\n/a/y.log");
  });

  it("find requires path and pattern before execution", async () => {
    const { c, exec } = fresh();
    await assert.rejects(() => runScout(exec, { action: "find", params: { pattern: "*.log" } }), /path is required/);
    await assert.rejects(() => runScout(exec, { action: "find", params: { path: "/srv" } }), /pattern is required/);
    assert.equal(c.calls.length, 0);
  });

  it("zfs pools runs zpool list with optional pool filter; datasets omitted", async () => {
    const a = fresh();
    await runScout(a.exec, { action: "zfs", subaction: "pools" });
    assert.deepEqual(a.c.calls, [{ file: "zpool", args: ["list"] }]);
    const b = fresh();
    await runScout(b.exec, { action: "zfs", subaction: "pools", params: { pool: "tank" } });
    assert.deepEqual(b.c.calls, [{ file: "zpool", args: ["list", "tank"] }]);
    const bad = fresh();
    await assert.rejects(() => runScout(bad.exec, { action: "zfs", subaction: "datasets" }), /Valid subactions in this subset: pools/);
    assert.equal(bad.c.calls.length, 0);
  });

  it("logs journal composes journalctl argv with defaults and filters", async () => {
    const a = fresh();
    await runScout(a.exec, { action: "logs", subaction: "journal" });
    assert.deepEqual(a.c.calls, [{ file: "journalctl", args: ["--no-pager", "-n", "100"] }]);
    const b = fresh();
    await runScout(b.exec, {
      action: "logs",
      subaction: "journal",
      params: { lines: 50, unit: "docker", priority: "err", since: "2026-10-01", grep: "fail" },
    });
    assert.deepEqual(b.c.calls, [{
      file: "journalctl",
      args: ["--no-pager", "-n", "50", "-u", "docker", "-p", "err", "--since", "2026-10-01", "--grep", "fail"],
    }]);
    const bad = fresh();
    await assert.rejects(
      () => runScout(bad.exec, { action: "logs", subaction: "journal", params: { lines: 0 } }),
      /positive integer/,
    );
    await assert.rejects(() => runScout(bad.exec, { action: "logs", subaction: "syslog" }), /Valid subactions in this subset: journal/);
    assert.equal(bad.c.calls.length, 0);
  });

  it("help is local and lists actions plus the allowlist", async () => {
    const { c, exec } = fresh();
    const out = (await runScout(exec, { action: "help" })) as { allowed_read_commands: string[] };
    assert.equal(c.calls.length, 0);
    assert.equal(out.allowed_read_commands.length, 18);
    assert.equal(getScoutHelp().actions.length, 6);
  });

  it("unknown scout action errors before execution", async () => {
    const { c, exec } = fresh();
    await assert.rejects(() => runScout(exec, { action: "beam" }), /Unknown action/);
    assert.equal(c.calls.length, 0);
  });
});

describe("formatPayload", () => {
  it("passes strings through and JSON-renders objects", () => {
    assert.equal(formatPayload("hi"), "hi");
    assert.equal(formatPayload({ a: 1 }), '{\n  "a": 1\n}');
  });
});

/**
 * hostpanel types.
 *
 * Both public tools are action routers: the caller picks a
 * required `action`, an optional `subaction`, and an optional
 * `params` object whose field names follow the per-action tables
 * in the public spec (host, container_id, path, pattern, command,
 * args, unit, lines, and so on).
 *
 * Process execution is described by a minimal executor surface so
 * tests can inject a fake executor and never touch Docker, SSH,
 * ZFS, or the journal. The real executor runs a file with an argv
 * array only — never a shell string.
 */

export interface RouterArgs {
  action: string;
  subaction?: string;
  params?: Record<string, unknown>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run one program with an argv array (no shell). */
export type ExecutorFn = (file: string, args: string[]) => Promise<ExecResult>;

export interface ExecOutcome {
  argv: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ActionInfo {
  action: string;
  subactions: string[];
  description: string;
}

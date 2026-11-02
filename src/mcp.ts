/**
 * hostpanel MCP server. Two tools: `flux` and `scout`, both action
 * routers over the labelled core subset (flux: docker info/version,
 * container list/inspect, host info, compose list, help; scout:
 * nodes, exec, find, zfs pools, logs journal, help).
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Execution goes through the default executor (execFile argv
 * arrays only, never a shell) and only the local host is served.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createDefaultExecutor,
  formatPayload,
  runFlux,
  runScout,
  VERSION,
} from "./hostpanel.js";

const FluxArgs = z.object({
  action: z.enum(["docker", "container", "host", "compose", "help"]),
  subaction: z.string().optional(),
  params: z.object({}).passthrough().optional(),
});

const ScoutArgs = z.object({
  action: z.enum(["nodes", "exec", "find", "zfs", "logs", "help"]),
  subaction: z.string().optional(),
  params: z.object({}).passthrough().optional(),
});

const TOOLS = [
  {
    name: "flux",
    description: "Docker daemon, container, host, and Compose operations (labelled core subset).",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["docker", "container", "host", "compose", "help"], description: "Operation group: docker, container, host, compose, or help." },
        subaction: { type: "string", description: "Specific operation within the chosen action group." },
        params: { type: "object", description: "Parameters object for the chosen operation." },
      },
      required: ["action"],
    },
  },
  {
    name: "scout",
    description: "SSH/local host inspection, allowlisted exec, find, ZFS, and logs (labelled core subset).",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: { type: "string", enum: ["nodes", "exec", "find", "zfs", "logs", "help"], description: "Inspection group: nodes, exec, find, zfs, logs, or help." },
        subaction: { type: "string", description: "Specific operation within the chosen action group." },
        params: { type: "object", description: "Parameters object for the chosen operation." },
      },
      required: ["action"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "hostpanel", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const executor = createDefaultExecutor();
  try {
    let out: unknown;
    if (name === "flux") {
      out = await runFlux(executor, FluxArgs.parse(args ?? {}));
    } else if (name === "scout") {
      out = await runScout(executor, ScoutArgs.parse(args ?? {}));
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();

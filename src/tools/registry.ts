import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ShapeOutput, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js"
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import type { ChatPushClient } from "../client.js"
import type { Config } from "../config.js"
import {
  AcceptedResponseError,
  ConfigError,
  InputValidationError,
  ChatPushRequestError,
  NetworkError,
  describeApiError,
} from "../errors.js"
import { log } from "../logger.js"

export interface ToolContext {
  config: Config
  client: ChatPushClient
}

export interface ToolDefinition<Shape extends ZodRawShapeCompat> {
  name: string
  title: string
  description: string
  inputSchema: Shape
  annotations?: ToolAnnotations
  /**
   * How the tool differs on the hosted server (mode "http"): parameters that would touch the server
   * itself (its disk, its network) are dropped from the schema, and the description is replaced.
   * The handler must still reject them — this only keeps them out of what the model sees.
   */
  remote?: { omitParams: readonly string[]; description: string }
  /** Returns the readable text shown to the model; throw to report an error. */
  handler(args: ShapeOutput<Shape>, context: ToolContext): Promise<string>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDefinition = ToolDefinition<any>

export function defineTool<Shape extends ZodRawShapeCompat>(tool: ToolDefinition<Shape>): ToolDefinition<Shape> {
  return tool
}

export function registerTools(server: McpServer, tools: readonly AnyToolDefinition[], context: ToolContext): void {
  const names = new Set<string>()
  for (const tool of tools) {
    if (names.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`)
    names.add(tool.name)

    const remote = context.config.mode === "http" ? tool.remote : undefined
    const inputSchema = remote
      ? Object.fromEntries(Object.entries(tool.inputSchema).filter(([key]) => !remote.omitParams.includes(key)))
      : tool.inputSchema

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: remote?.description ?? tool.description,
        inputSchema,
        annotations: { title: tool.title, ...tool.annotations },
      },
      // The SDK has already validated args against inputSchema at this point.
      (args: ShapeOutput<ZodRawShapeCompat>) => runTool(tool, args, context),
    )
  }
}

async function runTool(
  tool: AnyToolDefinition,
  args: ShapeOutput<ZodRawShapeCompat>,
  context: ToolContext,
): Promise<CallToolResult> {
  const started = Date.now()
  try {
    const text = await tool.handler(args, context)
    log.debug(`${tool.name} finished in ${Date.now() - started} ms`)
    return { content: [{ type: "text", text }] }
  } catch (err) {
    return toErrorResult(tool.name, err, context)
  }
}

function toErrorResult(toolName: string, err: unknown, context: ToolContext): CallToolResult {
  if (err instanceof AcceptedResponseError) {
    // Not an error for the model: the request went through, and an error would invite a repeat.
    log.warn(`${toolName}: ${err.message}`)
    return { content: [{ type: "text", text: err.message }] }
  }

  let text: string
  if (err instanceof ChatPushRequestError) {
    text = describeApiError(err.result, context.config.mode)
  } else if (err instanceof InputValidationError) {
    text = `Invalid parameters: ${err.message}`
  } else if (err instanceof ConfigError || err instanceof NetworkError) {
    text = err.message
  } else {
    text = `Unexpected error in ${toolName}: ${err instanceof Error ? err.message : String(err)}`
    log.error(err instanceof Error && err.stack ? err.stack : text)
  }
  log.warn(`${toolName}: ${text}`)
  return { content: [{ type: "text", text }], isError: true }
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { ShapeOutput, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js"
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import type { ChatPushClient } from "../client.js"
import type { Config } from "../config.js"
import { ConfigError, InputValidationError, ChatPushRequestError, NetworkError, describeApiError } from "../errors.js"
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

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
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
    return toErrorResult(tool.name, err)
  }
}

function toErrorResult(toolName: string, err: unknown): CallToolResult {
  let text: string
  if (err instanceof ChatPushRequestError) {
    text = describeApiError(err.result)
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

import { createRequire } from "node:module"
import dotenv from "dotenv"
import { ConfigError } from "./errors.js"

// dotenv 17 announces itself on stdout unless told to be quiet, and stdout carries the MCP protocol.
dotenv.config({ quiet: true })

// package.json sits one level above both src/ and dist/, and ships in the npm package and the .mcpb bundle.
const pkg = createRequire(import.meta.url)("../package.json") as { name: string; version: string }

export const SERVER_NAME = pkg.name
export const SERVER_VERSION = pkg.version

const DEFAULT_BASE_URL = "https://api.chatpush.ru"
const REQUEST_TIMEOUT_MS = 30_000

export interface Config {
  /** Bearer token from the ChatPush dashboard. Checked per request so the server can start without it. */
  token?: string
  baseUrl: string
  timeoutMs: number
}

export function loadConfig(): Config {
  const baseUrl = process.env.CHATPUSH_BASE_URL?.trim() || DEFAULT_BASE_URL
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new ConfigError(`CHATPUSH_BASE_URL is not a valid URL: ${baseUrl}`)
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigError(`CHATPUSH_BASE_URL must start with https:// (got ${baseUrl})`)
  }

  return {
    token: process.env.CHATPUSH_TOKEN?.trim() || undefined,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    timeoutMs: REQUEST_TIMEOUT_MS,
  }
}

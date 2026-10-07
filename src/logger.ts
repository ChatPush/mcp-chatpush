// stdout carries the MCP JSON-RPC stream, so every diagnostic goes to stderr.

function write(level: string, message: string): void {
  process.stderr.write(`[chatpush-mcp] ${level} ${message}\n`)
}

export const log = {
  /** Unprefixed line, for the startup banner. */
  raw(message: string): void {
    process.stderr.write(`${message}\n`)
  },
  debug(message: string): void {
    if (/^(1|true|yes)$/i.test(process.env.CHATPUSH_DEBUG ?? "")) write("debug", message)
  },
  info(message: string): void {
    write("info", message)
  },
  warn(message: string): void {
    write("warn", message)
  },
  error(message: string): void {
    write("error", message)
  },
}

// Release sanity checks: package.json, server.json and manifest.json agree on name and version,
// and the built server exposes exactly the tools listed in manifest.json.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"

const EXPECTED_TOOL_COUNT = 19

const read = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
const pkg = read("package.json")
const server = read("server.json")
const manifest = read("manifest.json")
const errors = []

if (pkg.mcpName !== server.name) {
  errors.push(`package.json mcpName (${pkg.mcpName}) must equal server.json name (${server.name})`)
}
const npmPackage = server.packages?.find((p) => p.registryType === "npm")
const versions = {
  "server.json version": server.version,
  "server.json npm package version": npmPackage?.version,
  "manifest.json version": manifest.version,
}
for (const [label, version] of Object.entries(versions)) {
  if (version !== pkg.version) errors.push(`${label} is ${version}, package.json is ${pkg.version}`)
}
if (npmPackage?.identifier !== pkg.name) {
  errors.push(`server.json npm identifier (${npmPackage?.identifier}) must equal package.json name (${pkg.name})`)
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("../dist/index.js", import.meta.url))],
  env: { PATH: process.env.PATH ?? "" },
  stderr: "ignore",
})
const client = new Client({ name: "release-check", version: pkg.version })
await client.connect(transport)
const { tools } = await client.listTools()
await client.close()

const serverTools = tools.map((t) => t.name).sort()
const manifestTools = (manifest.tools ?? []).map((t) => t.name).sort()
if (serverTools.length !== EXPECTED_TOOL_COUNT) {
  errors.push(`server exposes ${serverTools.length} tools, expected ${EXPECTED_TOOL_COUNT}`)
}
if (JSON.stringify(serverTools) !== JSON.stringify(manifestTools)) {
  errors.push(`manifest.json tools (${manifestTools.join(", ")}) differ from the server (${serverTools.join(", ")})`)
}

if (errors.length) {
  process.stderr.write(`Release check failed:\n- ${errors.join("\n- ")}\n`)
  process.exit(1)
}
process.stdout.write(`Release check passed: ${pkg.name}@${pkg.version}, ${serverTools.length} tools\n`)

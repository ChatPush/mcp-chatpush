import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { readLimited } from "../src/tools/file.js"
import { connectClient, json, mockFetch, resultText, testConfig } from "./helpers.js"

let restore = () => {}
afterEach(() => restore())

function stream(chunks: number[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const size of chunks) controller.enqueue(new Uint8Array(size))
      controller.close()
    },
  })
}

describe("readLimited", () => {
  test("reads a body under the limit", async () => {
    assert.equal((await readLimited(stream([3, 4]), 10)).byteLength, 7)
  })
  test("stops past the limit", async () => {
    await assert.rejects(readLimited(stream([6, 6, 6]), 10), /larger than/)
  })
})

describe("send_file on the hosted server", () => {
  test("file_path and file_url are not in the schema", async () => {
    const client = await connectClient(testConfig("http"))
    const { tools } = await client.listTools()
    const sendFile = tools.find((tool) => tool.name === "send_file")
    assert.ok(sendFile)
    assert.equal(Object.hasOwn(sendFile.inputSchema.properties ?? {}, "file_path"), false)
    assert.equal(Object.hasOwn(sendFile.inputSchema.properties ?? {}, "file_url"), false)
    assert.doesNotMatch(sendFile.description ?? "", /file_path/)
  })

  test("never reads a server file or fetches a URL, even when they are passed", async () => {
    const mock = mockFetch(() => json({}))
    restore = mock.restore
    const client = await connectClient(testConfig("http"))
    for (const args of [{ file_path: "/etc/hosts" }, { file_url: "http://127.0.0.1/x.pdf" }]) {
      const result = await client.callTool({ name: "send_file", arguments: { phone: "79990000000", file_name: "x.pdf", ...args } })
      assert.equal(result.isError, true)
      assert.doesNotMatch(resultText(result), /\/etc\/hosts|127\.0\.0\.1/)
    }
    assert.equal(mock.calls.length, 0)
  })
})

describe("send_file locally", () => {
  test("keeps file_path and file_url", async () => {
    const client = await connectClient(testConfig("stdio"))
    const sendFile = (await client.listTools()).tools.find((tool) => tool.name === "send_file")
    assert.ok(Object.hasOwn(sendFile?.inputSchema.properties ?? {}, "file_path"))
    assert.ok(Object.hasOwn(sendFile?.inputSchema.properties ?? {}, "file_url"))
  })

  test("a missing file is reported by the path as given", async () => {
    const client = await connectClient(testConfig("stdio"))
    const result = await client.callTool({ name: "send_file", arguments: { phone: "79990000000", file_path: "~/no-such-file.pdf" } })
    assert.match(resultText(result), /~\/no-such-file\.pdf/)
  })

  test("oversized base64 is refused before decoding", async () => {
    const client = await connectClient(testConfig("stdio"))
    const huge = "A".repeat(140 * 1024 * 1024)
    const result = await client.callTool({ name: "send_file", arguments: { phone: "79990000000", file_base64: huge, file_name: "a.pdf" } })
    assert.match(resultText(result), /up to 100 MB/)
  })
})

describe("sends whose response can't be read", () => {
  test("send_message reports success and asks not to repeat", async () => {
    restore = mockFetch(() => json({ something: "else" })).restore
    const client = await connectClient(testConfig("stdio"))
    const result = await client.callTool({ name: "send_message", arguments: { phone: "79990000000", text: "hi" } })
    assert.notEqual(result.isError, true)
    assert.match(resultText(result), /Do NOT repeat/)
  })
})

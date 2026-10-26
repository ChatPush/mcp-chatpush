import assert from "node:assert/strict"
import { afterEach, describe, test } from "node:test"
import { z } from "zod"
import { ChatPushClient } from "../src/client.js"
import { AcceptedResponseError } from "../src/errors.js"
import { json, mockFetch, networkFailure, testConfig } from "./helpers.js"

const schema = z.object({ ok: z.boolean() })
let restore = () => {}
afterEach(() => restore())

describe("ChatPushClient", () => {
  test("retries 429 honouring Retry-After", async () => {
    let n = 0
    const mock = mockFetch(() => (++n < 3 ? json({}, 429, { "Retry-After": "0" }) : json({ ok: true })))
    restore = mock.restore
    const result = await new ChatPushClient(testConfig()).request({ method: "GET", path: "/x", schema })
    assert.deepEqual(result, { error: false, status: 200, data: { ok: true } })
    assert.equal(mock.calls.length, 3)
  })

  test("does not wait for a Retry-After longer than 15 s", async () => {
    const mock = mockFetch(() => json({}, 429, { "Retry-After": "30" }))
    restore = mock.restore
    const result = await new ChatPushClient(testConfig()).request({ method: "GET", path: "/x", schema })
    assert.equal(result.error, true)
    assert.equal(mock.calls.length, 1)
  })

  test("retries 5xx for reads, not for sends", async () => {
    let mock = mockFetch((_, __) => (mock.calls.length < 2 ? json({}, 502) : json({ ok: true })))
    restore = mock.restore
    const read = await new ChatPushClient(testConfig()).request({ method: "GET", path: "/x", schema })
    assert.equal(read.error, false)
    assert.equal(mock.calls.length, 2)
    restore()

    mock = mockFetch(() => json({}, 502))
    restore = mock.restore
    const send = await new ChatPushClient(testConfig()).request({ method: "POST", path: "/x", schema, retryServerErrors: false })
    assert.equal(send.error, true)
    assert.equal(mock.calls.length, 1)
  })

  test("a broken connection on a send says it may have gone through", async () => {
    restore = mockFetch(() => Promise.reject(networkFailure("ECONNRESET"))).restore
    const result = await new ChatPushClient(testConfig()).request({ method: "POST", path: "/x", schema, retryServerErrors: false })
    assert.equal(result.error, true)
    assert.match(result.error ? result.message : "", /may have accepted it — do NOT repeat/)
  })

  test("a refused connection on a send says it was not reached", async () => {
    restore = mockFetch(() => Promise.reject(networkFailure("ECONNREFUSED"))).restore
    const result = await new ChatPushClient(testConfig()).request({ method: "POST", path: "/x", schema, retryServerErrors: false })
    assert.match(result.error ? result.message : "", /^Could not reach ChatPush/)
  })

  test("2xx in an unexpected format on a send is reported as accepted, with secrets masked", async () => {
    restore = mockFetch(() => json({ unexpected: true, token: "abcdefghijklmnopqrstuvwxyz" })).restore
    const request = new ChatPushClient(testConfig()).request({ method: "POST", path: "/x", schema, retryServerErrors: false })
    await assert.rejects(request, (err: Error) => {
      assert.ok(err instanceof AcceptedResponseError)
      assert.match(err.message, /Do NOT repeat/)
      assert.doesNotMatch(err.message, /abcdefghijklmnopqrstuvwxyz/)
      return true
    })
  })

  test("2xx in an unexpected format on a read masks the token in the raw response", async () => {
    restore = mockFetch(() => json({ account: { token: "abcdefghijklmnopqrstuvwxyz" } })).restore
    const result = await new ChatPushClient(testConfig()).request({ method: "GET", path: "/x", schema })
    assert.equal(result.error, true)
    assert.doesNotMatch(result.error ? result.message : "", /abcdefghijklmnopqrstuvwxyz/)
  })

  test("a body cut off after 2xx on a send is reported as accepted", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":'))
        controller.error(new TypeError("terminated"))
      },
    })
    restore = mockFetch(() => new Response(body, { status: 200 })).restore
    const request = new ChatPushClient(testConfig()).request({ method: "POST", path: "/x", schema, retryServerErrors: false })
    await assert.rejects(request, AcceptedResponseError)
  })

  test("missing token message depends on the mode", async () => {
    const config = { ...testConfig("http"), token: undefined }
    await assert.rejects(new ChatPushClient(config).request({ method: "GET", path: "/x", schema }), /Authorization: Bearer/)
  })
})

describe("where parameters go", () => {
  test("POST sends them in the body, not the URL", async () => {
    let seen: { url: string; body: string } | undefined
    restore = mockFetch(async (url, init) => {
      seen = { url, body: String(init?.body) }
      return json({ ok: true })
    }).restore
    await new ChatPushClient(testConfig()).request({
      method: "POST",
      path: "/api/v1/delivery",
      query: { phone: "79990000000", text: "привет", dispatch_routing: ["max", "sms"], skip: undefined },
      schema,
    })
    assert.equal(seen?.url, "https://api.chatpush.test/api/v1/delivery")
    const body = new URLSearchParams(seen?.body)
    assert.equal(body.get("text"), "привет")
    assert.deepEqual(body.getAll("dispatch_routing[]"), ["max", "sms"])
    assert.equal(body.has("skip"), false)
  })

  test("multipart requests get the fields added to the form", async () => {
    let form: FormData | undefined
    restore = mockFetch(async (_, init) => {
      form = init?.body as FormData
      return json({ ok: true })
    }).restore
    const upload = new FormData()
    upload.append("file", new Blob(["x"]), "a.pdf")
    await new ChatPushClient(testConfig()).request({ method: "POST", path: "/f", query: { phone: "7999" }, form: upload, schema })
    assert.equal(form?.get("phone"), "7999")
    assert.ok(form?.get("file"))
  })

  test("GET keeps them in the query string", async () => {
    const mock = mockFetch(() => json({ ok: true }))
    restore = mock.restore
    await new ChatPushClient(testConfig()).request({ method: "GET", path: "/x", query: { id: 5 }, schema })
    assert.equal(mock.calls[0], "https://api.chatpush.test/x?id=5")
  })
})

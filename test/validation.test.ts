import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { assertRecipient, assertScheduledAt } from "../src/tools/common.js"

describe("assertRecipient", () => {
  test("needs some recipient", () => assert.throws(() => assertRecipient({}), /Provide a recipient/))
  test("username needs tdlib", () => assert.throws(() => assertRecipient({ username: "bob" }), /tdlib/))
  test("username with tdlib is fine", () => assertRecipient({ username: "bob", dispatch_routing: ["tdlib"] }))
  test("whatsapp_lid needs whatsapp", () => assert.throws(() => assertRecipient({ whatsapp_lid: "1" }), /whatsapp/))
  test("channels other than tdlib need a phone", () =>
    assert.throws(() => assertRecipient({ username: "bob", dispatch_routing: ["tdlib", "sms"] }), /need a phone/))
  test("duplicates are rejected", () =>
    assert.throws(() => assertRecipient({ phone: "79990000000", dispatch_routing: ["sms", "sms"] }), /duplicates/))
})

describe("assertScheduledAt", () => {
  const now = new Date("2026-10-26T12:00:00Z")
  test("rejects the past", () => assert.throws(() => assertScheduledAt("2026-10-26 11:00:00", now), /1 minute/))
  test("rejects more than a month ahead", () => assert.throws(() => assertScheduledAt("2026-12-01 12:00:00", now), /1 month/))
  test("accepts tomorrow", () => assertScheduledAt("2026-10-27 12:00:00", now))
  test("rejects garbage", () => assert.throws(() => assertScheduledAt("tomorrow", now), /not a valid date/))
})

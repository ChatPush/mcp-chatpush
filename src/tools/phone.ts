import { unwrap } from "../client.js"
import { field, formatOperator, lines } from "../format.js"
import { phoneInfoResponseSchema } from "../types.js"
import { phoneSchema } from "./common.js"
import { defineTool } from "./registry.js"

const getPhoneInfo = defineTool({
  name: "get_phone_info",
  title: "Get phone info",
  description:
    "Look up phone number information including country, mobile operator name and brand. Useful before sending to verify the number and determine routing. " +
    "Also returns the number normalized to international format, e.g. when the user wrote it with spaces or brackets.",
  inputSchema: {
    phone: phoneSchema.describe("Phone in international format. Special characters allowed, e.g. +995 (598) 46-45-33."),
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "GET",
      path: "/api/v1/operators/search",
      query: { phone: args.phone },
      schema: phoneInfoResponseSchema,
    })
    const data = unwrap(result)
    return lines(
      `Phone number ${args.phone}:`,
      "",
      field("Formatted", data.formatted_phone),
      field("Country", data.operator?.country),
      field("Operator", formatOperator(data.operator)),
      field("Operator ID", data.operator?.id),
      !data.operator && "ChatPush did not identify an operator for this number.",
    )
  },
})

export const phoneTools = [getPhoneInfo]

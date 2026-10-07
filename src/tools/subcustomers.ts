// Multi-account tools: a multi-customer creates and inspects sub-customers, each with its own token.
import { z } from "zod"
import { unwrap } from "../client.js"
import { describeTdlibSession, describeWhatsappSession, field, joinDefined, lines, maskSecret } from "../format.js"
import { subCustomerListResponseSchema, subCustomerResponseSchema, type SubCustomer } from "../types.js"
import { defineTool } from "./registry.js"

const MULTI_NOTE = "Requires a multi-customer account: a ChatPush client that may create sub-clients through the API."

const includeTokensSchema = z
  .boolean()
  .default(false)
  .describe("Show the full sub-customer tokens. Default false: tokens are masked.")

function formatSubCustomer(subCustomer: SubCustomer, includeTokens: boolean): string {
  const subscription = joinDefined([
    subCustomer.subscription_status ?? undefined,
    subCustomer.subscription_paid_until ? `paid until ${subCustomer.subscription_paid_until}` : undefined,
  ])
  const whatsapp = joinDefined([
    describeWhatsappSession(subCustomer.whatsapp_session),
    subCustomer.whatsapp_phone ? `phone ${subCustomer.whatsapp_phone}` : undefined,
  ])
  return lines(
    `Sub-customer "${subCustomer.name ?? "unnamed"}"`,
    field("  customer_id", subCustomer.customer_id),
    field("  Subscription", subscription),
    field("  WhatsApp", whatsapp),
    field("  Telegram (tdlib)", describeTdlibSession(subCustomer.tdlib_session)),
    field("  Token", includeTokens ? subCustomer.token : maskSecret(subCustomer.token)),
  )
}

function listFrom(data: { sub_customers?: SubCustomer[] | null; sub_customer?: SubCustomer | null }): SubCustomer[] {
  if (data.sub_customers?.length) return data.sub_customers
  return data.sub_customer ? [data.sub_customer] : []
}

const createSubCustomer = defineTool({
  name: "create_sub_customer",
  title: "Create sub-customer",
  description: [
    "Create a sub-client under your ChatPush multi-customer account. The response contains the sub-customer's own API token — it is shown only here, so save it.",
    "Use it when onboarding a new client of a platform built on ChatPush: each sub-customer gets a separate account, its own messengers and its own subscription.",
    MULTI_NOTE,
  ].join("\n\n"),
  inputSchema: {
    name: z.string().min(1).describe("Name of the sub-customer, e.g. the client's company name."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "POST",
      path: "/api/sub_customers",
      query: { name: args.name },
      schema: subCustomerResponseSchema,
      retryServerErrors: false,
    })
    const subCustomer = unwrap(result).sub_customer
    return lines(
      "Sub-customer created.",
      "",
      formatSubCustomer(subCustomer, true),
      "",
      "Store the token securely — use it as CHATPUSH_TOKEN (or in the Authorization header) to act on behalf of this sub-customer.",
      "Next step: connect a messenger for it with get_messenger_auth_link.",
    )
  },
})

const listSubCustomers = defineTool({
  name: "list_sub_customers",
  title: "List sub-customers",
  description: [
    "List the sub-clients of your ChatPush multi-customer account with their subscription status and whether WhatsApp and Telegram are connected.",
    MULTI_NOTE,
  ].join("\n\n"),
  inputSchema: {
    include_tokens: includeTokensSchema,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "GET",
      path: "/api/sub_customers",
      schema: subCustomerListResponseSchema,
    })
    const subCustomers = listFrom(unwrap(result))
    if (!subCustomers.length) return "No sub-customers yet. Use create_sub_customer to add one."
    return lines(
      `Sub-customers (${subCustomers.length}):`,
      "",
      ...subCustomers.map((subCustomer) => formatSubCustomer(subCustomer, args.include_tokens)),
    )
  },
})

const getSubCustomer = defineTool({
  name: "get_sub_customer",
  title: "Get sub-customer",
  description: [
    "Show one sub-client by its customer_id: subscription status and expiry, and whether WhatsApp and Telegram are connected.",
    MULTI_NOTE,
  ].join("\n\n"),
  inputSchema: {
    customer_id: z.number().int().positive().describe("Internal ChatPush ID of the sub-customer."),
    include_tokens: includeTokensSchema,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async handler(args, { client }) {
    const result = await client.request({
      method: "GET",
      path: `/api/sub_customers/${args.customer_id}`,
      schema: subCustomerResponseSchema,
    })
    return formatSubCustomer(unwrap(result).sub_customer, args.include_tokens)
  },
})

export const subCustomerTools = [createSubCustomer, listSubCustomers, getSubCustomer]

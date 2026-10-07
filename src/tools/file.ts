import { readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, extname, resolve } from "node:path"
import { z } from "zod"
import { unwrap } from "../client.js"
import { InputValidationError, NetworkError } from "../errors.js"
import { formatBytes } from "../format.js"
import { deliveryResponseSchema } from "../types.js"
import {
  assertRecipient,
  assertScheduledAt,
  callbackUrlSchema,
  dispatchRoutingSchema,
  externalIdSchema,
  phoneSchema,
  prioritySchema,
  replyToMessageIdSchema,
  scheduledAtSchema,
  senderNameSchema,
  simulateTypingSchema,
  tdlibUserIdSchema,
  telegramUsernameSchema,
  utmMarkSchema,
} from "./common.js"
import { formatDelivery } from "./delivery.js"
import { defineTool } from "./registry.js"

const MAX_FILE_BYTES = 100 * 1024 * 1024
const NATIVE_PHOTO_MAX_BYTES = 10 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 60_000

/** Formats accepted by /api/v1/send_file, keyed by file extension. */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/opus",
  ".mp3": "audio/mpeg",
  ".aac": "audio/aac",
  ".amr": "audio/AMR",
  ".awb": "audio/AMR-WB",
  ".3gp": "audio/3gpp",
  ".3g2": "audio/3gpp2",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".vcf": "text/x-vcard",
}

const SUPPORTED_MIME_TYPES = new Set(
  [...Object.values(MIME_BY_EXTENSION), "audio/mpeg3", "audio/x-mpeg-3", "audio/x-hx-aac-adts", "audio/AMR-WB+"].map(
    (mime) => mime.toLowerCase(),
  ),
)

interface LoadedFile {
  bytes: Uint8Array
  fileName?: string
  detectedMimeType?: string
}

async function loadFile(args: { file_path?: string; file_url?: string; file_base64?: string }): Promise<LoadedFile> {
  const sources = [args.file_path, args.file_url, args.file_base64].filter((source) => source !== undefined)
  if (sources.length !== 1) {
    throw new InputValidationError("Provide exactly one file source: file_path, file_url or file_base64.")
  }

  if (args.file_path !== undefined) {
    const path = resolve(args.file_path.replace(/^~(?=$|[/\\])/, homedir()))
    const info = await stat(path).catch(() => undefined)
    if (!info) throw new InputValidationError(`File not found or not readable: ${path}`)
    if (!info.isFile()) throw new InputValidationError(`Not a regular file: ${path}`)
    assertFileSize(info.size)
    return { bytes: await readFile(path), fileName: basename(path) }
  }

  if (args.file_url !== undefined) {
    let response: Response
    try {
      response = await fetch(args.file_url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
    } catch (err) {
      throw new NetworkError(`Could not download file_url: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (!response.ok) throw new NetworkError(`Could not download file_url: HTTP ${response.status} ${response.statusText}`)
    const declaredSize = Number(response.headers.get("content-length"))
    if (declaredSize) assertFileSize(declaredSize)
    const bytes = new Uint8Array(await response.arrayBuffer())
    assertFileSize(bytes.byteLength)
    return {
      bytes,
      fileName: decodeURIComponent(basename(new URL(response.url || args.file_url).pathname)) || undefined,
      detectedMimeType: response.headers.get("content-type")?.split(";")[0]?.trim(),
    }
  }

  const raw = args.file_base64 ?? ""
  const dataUrl = /^data:([^;,]+)?(?:;base64)?,/.exec(raw)
  const bytes = Buffer.from(dataUrl ? raw.slice(dataUrl[0].length) : raw, "base64")
  if (bytes.byteLength === 0) throw new InputValidationError("file_base64 is empty or not valid base64.")
  assertFileSize(bytes.byteLength)
  return { bytes, detectedMimeType: dataUrl?.[1] }
}

function assertFileSize(bytes: number): void {
  if (bytes > MAX_FILE_BYTES) {
    throw new InputValidationError(`The file is ${formatBytes(bytes)}; ChatPush accepts files up to 100 MB.`)
  }
}

function resolveNameAndMime(file: LoadedFile, fileNameArg: string | undefined): { fileName: string; mimeType: string } {
  let fileName = fileNameArg ?? file.fileName
  if (!fileName) {
    throw new InputValidationError("file_name is required with file_base64 and must include the extension, e.g. document.pdf.")
  }
  const extension = extname(fileName).toLowerCase()
  const mimeType = MIME_BY_EXTENSION[extension] ?? file.detectedMimeType
  if (!mimeType || !SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase())) {
    throw new InputValidationError(
      `Unsupported file type${mimeType ? ` (${mimeType})` : ""} for "${fileName}". Supported: ${Object.keys(MIME_BY_EXTENSION).join(", ")}.`,
    )
  }
  // ChatPush requires the extension in file_name.
  if (!extension) {
    const known = Object.entries(MIME_BY_EXTENSION).find(([, mime]) => mime.toLowerCase() === mimeType.toLowerCase())
    if (!known) throw new InputValidationError(`file_name "${fileName}" must include a file extension.`)
    fileName = `${fileName}${known[0]}`
  }
  return { fileName, mimeType }
}

const sendFile = defineTool({
  name: "send_file",
  title: "Send file",
  description: [
    "Send a file (document, image, audio, video, contact) to a recipient via WhatsApp or Telegram. File is uploaded as multipart/form-data. Images under 10MB sent natively, larger files as download links active for 7 days.",
    "Use it when the user wants to share a document, photo, voice message, video or contact card. Provide the file as exactly one of: file_path (local file), file_url (downloaded by the server) or file_base64 (with file_name).",
    "Supported: pdf, doc, docx, ppt, pptx, xls, xlsx, zip, 7z; ogg, opus, mp3, aac, amr, 3gp; jpeg, png, webp; mp4; vcf. Max 100 MB. Recipient rules are the same as send_message.",
  ].join("\n\n"),
  inputSchema: {
    file_path: z.string().min(1).optional().describe("Absolute path of a local file to upload (~ is expanded)."),
    file_url: z.url({ protocol: /^https?$/ }).optional().describe("Public http(s) URL of the file; the server downloads and uploads it."),
    file_base64: z.string().min(1).optional().describe("File content as base64 (a data: URL is accepted too). Requires file_name."),
    file_name: z
      .string()
      .min(1)
      .optional()
      .describe("Filename with extension, e.g. document.pdf. Defaults to the name from file_path or file_url."),
    phone: phoneSchema.optional().describe("Recipient phone in international format. Optional if username is used (tdlib)."),
    caption: z.string().min(1).optional().describe("Description below the file (WhatsApp only)."),
    customer_id: z.string().min(1).optional().describe("Internal client ID."),
    type: z
      .enum(["document", "image"])
      .optional()
      .describe("document = send as file, image = send as photo (WhatsApp/tdlib)."),
    sender_name: senderNameSchema.optional(),
    utm_mark: utmMarkSchema.optional(),
    callback_url: callbackUrlSchema.optional(),
    external_id: externalIdSchema.optional(),
    dispatch_routing: dispatchRoutingSchema.optional(),
    scheduled_at: scheduledAtSchema.optional(),
    priority: prioritySchema.optional(),
    username: telegramUsernameSchema.optional().describe("Telegram username (tdlib only)."),
    reply_to_message_id: replyToMessageIdSchema.optional(),
    tdlib_user_id: tdlibUserIdSchema.optional(),
    simulate_typing: simulateTypingSchema.optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  async handler(args, { client }) {
    assertRecipient(args)
    assertScheduledAt(args.scheduled_at)

    const file = await loadFile(args)
    const { fileName, mimeType } = resolveNameAndMime(file, args.file_name)
    if (args.type === "image" && !mimeType.startsWith("image/")) {
      throw new InputValidationError(`type "image" only works for JPEG, PNG or WebP files, not ${mimeType}. Use "document" or omit type.`)
    }

    const form = new FormData()
    form.append("file", new Blob([new Uint8Array(file.bytes)], { type: mimeType }), fileName)

    const result = await client.request({
      method: "POST",
      path: "/api/v1/send_file",
      query: {
        file_name: fileName,
        phone: args.phone,
        caption: args.caption,
        customer_id: args.customer_id,
        type: args.type,
        sender_name: args.sender_name,
        utm_mark: args.utm_mark,
        callback_url: args.callback_url,
        external_id: args.external_id,
        dispatch_routing: args.dispatch_routing,
        scheduled_at: args.scheduled_at,
        priority: args.priority,
        username: args.username,
        reply_to_message_id: args.reply_to_message_id,
        tdlib_user_id: args.tdlib_user_id,
        simulate_typing: args.simulate_typing,
      },
      form,
      schema: deliveryResponseSchema,
      retryServerErrors: false,
    })
    const { delivery } = unwrap(result)

    const heading = `File "${fileName}" (${formatBytes(file.bytes.byteLength)}, ${mimeType}) accepted by ChatPush. Check delivery with get_delivery_status (id ${delivery.id}).`
    const largeImage = mimeType.startsWith("image/") && file.bytes.byteLength > NATIVE_PHOTO_MAX_BYTES
    const note = largeImage ? "\n\nNote: the image is over 10 MB, so it will arrive as a file rather than a photo." : ""
    return formatDelivery(delivery, heading) + note
  },
})

export const fileTools = [sendFile]

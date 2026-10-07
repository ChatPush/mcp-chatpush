// Helpers for turning API objects into readable tool output.

import { DELIVERY_STATUSES, TDLIB_SESSION_STATES, TRAFFIC_CATEGORIES } from "./types.js"

export type Line = string | false | null | undefined

/** Joins lines, dropping `undefined`, `null` and `false`. Use `""` for a blank line. */
export function lines(...items: Line[]): string {
  return items.filter((item): item is string => typeof item === "string").join("\n")
}

/** `label: value`, or `undefined` when there is nothing to show. */
export function field(label: string, value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (Array.isArray(value)) return value.length ? `${label}: ${value.join(", ")}` : undefined
  return `${label}: ${String(value)}`
}

/** Joins the present parts with ", ", or `undefined` when none are present. */
export function joinDefined(parts: Line[]): string | undefined {
  const present = parts.filter((part): part is string => typeof part === "string" && part !== "")
  return present.length ? present.join(", ") : undefined
}

export function maskSecret(secret: string | null | undefined): string | undefined {
  if (!secret) return undefined
  return secret.length <= 12 ? "**** (masked)" : `${secret.slice(0, 6)}…${secret.slice(-4)} (masked)`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatOperator(
  operator: { name?: string | null; brand_name?: string | null; country?: string | null } | null | undefined,
): string | undefined {
  if (!operator) return undefined
  const names = [operator.brand_name, operator.name, operator.country].filter((v): v is string => Boolean(v))
  return names.length ? [...new Set(names)].join(" / ") : undefined
}

export function describeStatus(statusId: number, apiDescription?: string | null): string {
  const status = DELIVERY_STATUSES[statusId]
  if (!status) return `${apiDescription ?? "Unknown status"} (status_id ${statusId})`
  const stage = status.final ? "final" : "not final yet"
  return `${status.label} (${status.name}, status_id ${statusId}, ${stage}). ${status.hint}`
}

export function describeTrafficCategory(category: number | null | undefined): string | undefined {
  if (category === undefined || category === null) return undefined
  return TRAFFIC_CATEGORIES[category] ?? String(category)
}

export function describeTdlibSession(state: number | null | undefined): string | undefined {
  if (state === undefined || state === null) return undefined
  return `${TDLIB_SESSION_STATES[state] ?? "unknown state"} (${state})`
}

export function describeWhatsappSession(state: number | null | undefined): string | undefined {
  if (state === undefined || state === null) return undefined
  return state === 1 ? "authorized" : "not authorized"
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

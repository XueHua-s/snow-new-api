/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
// return_error helpers

export type ReturnErrorDraft = {
  message: string
  statusCode: number
  code: string
  type: string
  skipRetry: boolean
  simpleMode: boolean
}

export const parseReturnErrorDraft = (valueText: string): ReturnErrorDraft => {
  const defaults: ReturnErrorDraft = {
    message: '',
    statusCode: 400,
    code: '',
    type: '',
    skipRetry: true,
    simpleMode: true,
  }
  const raw = String(valueText ?? '').trim()
  if (!raw) return defaults
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const statusRaw =
        parsed.status_code !== undefined ? parsed.status_code : parsed.status
      const statusValue = Number(statusRaw)
      return {
        ...defaults,
        message: String(
          (parsed.message as string) || (parsed.msg as string) || ''
        ).trim(),
        statusCode:
          Number.isInteger(statusValue) &&
          statusValue >= 100 &&
          statusValue <= 599
            ? statusValue
            : 400,
        code: String((parsed.code as string) || '').trim(),
        type: String((parsed.type as string) || '').trim(),
        skipRetry: parsed.skip_retry !== false,
        simpleMode: false,
      }
    }
  } catch {
    /* treat as plain text */
  }
  return { ...defaults, message: raw, simpleMode: true }
}

export const buildReturnErrorValueText = (
  draft: Partial<ReturnErrorDraft>
): string => {
  const message = String(draft.message || '').trim()
  if (draft.simpleMode) return message
  const statusCode = Number(draft.statusCode)
  const payload: Record<string, unknown> = {
    message,
    status_code:
      Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 599
        ? statusCode
        : 400,
  }
  const code = String(draft.code || '').trim()
  const type = String(draft.type || '').trim()
  if (code) payload.code = code
  if (type) payload.type = type
  if (draft.skipRetry === false) payload.skip_retry = false
  return JSON.stringify(payload)
}

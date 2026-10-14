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
export const HTTP_PROTOCOL_AUTO = 'auto'

export const HTTP_PROTOCOL_HTTP1 = 'http1'

export const MAX_HTTP2_CONNECTION_SHARDS = 8

export function normalizeHttpProtocol(
  value: string | undefined | null
): 'auto' | 'http1' {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (normalized === HTTP_PROTOCOL_HTTP1) {
    return HTTP_PROTOCOL_HTTP1
  }
  return HTTP_PROTOCOL_AUTO
}

export function normalizeHttp2ConnectionShards(
  value: number | undefined | null
): number {
  if (value == null || Number.isNaN(value) || value === 0) {
    return 1
  }
  if (value < 1) {
    return 1
  }
  if (value > MAX_HTTP2_CONNECTION_SHARDS) {
    return MAX_HTTP2_CONNECTION_SHARDS
  }
  return value
}

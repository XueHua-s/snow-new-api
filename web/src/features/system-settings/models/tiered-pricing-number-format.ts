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
export function unitCostToPrice(uc: number | string): number {
  return Number(uc) || 0
}

export function priceToUnitCost(price: number | string): number {
  return Number(price) || 0
}

export function formatTokenHint(n: number | string | null | undefined): string {
  if (n == null || n === '' || Number.isNaN(Number(n))) return ''
  const v = Number(n)
  if (v === 0) return '= 0'
  if (v >= 1_000_000) return `= ${(v / 1_000_000).toLocaleString()}M tokens`
  if (v >= 1_000) return `= ${(v / 1_000).toLocaleString()}K tokens`
  return `= ${v.toLocaleString()} tokens`
}

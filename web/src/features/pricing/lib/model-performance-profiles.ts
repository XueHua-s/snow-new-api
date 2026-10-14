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
export const PROFILE_BY_NAME = (name: string) => {
  const n = name.toLowerCase()
  if (/embed|rerank/.test(n)) return 'embedding'
  if (/image|sora|veo|kling|pika|jimeng|dalle|imagen/.test(n)) return 'image'
  if (/whisper|tts|voice|audio/.test(n)) return 'audio'
  if (/o1|o3|o4|reasoning|thinking|deepseek-r/.test(n)) return 'reasoning'
  if (/flash|haiku|mini|small|nano|fast/.test(n)) return 'fast'
  if (/gpt-5|opus|ultra|405|70b/.test(n)) return 'large'
  return 'standard'
}

type ProfileSpec = {
  ttftRange: [number, number]
  throughputRange: [number, number]
  uptimeRange: [number, number]
}

export const PROFILE_SPECS: Record<string, ProfileSpec> = {
  embedding: {
    ttftRange: [40, 120],
    throughputRange: [0, 0],
    uptimeRange: [99.9, 99.99],
  },
  image: {
    ttftRange: [2_500, 12_000],
    throughputRange: [0, 0],
    uptimeRange: [98.5, 99.8],
  },
  audio: {
    ttftRange: [180, 600],
    throughputRange: [0, 0],
    uptimeRange: [99.5, 99.95],
  },
  reasoning: {
    ttftRange: [1_800, 5_500],
    throughputRange: [25, 70],
    uptimeRange: [99.4, 99.95],
  },
  fast: {
    ttftRange: [180, 480],
    throughputRange: [110, 240],
    uptimeRange: [99.7, 99.99],
  },
  large: {
    ttftRange: [600, 1_400],
    throughputRange: [55, 95],
    uptimeRange: [99.5, 99.95],
  },
  standard: {
    ttftRange: [400, 900],
    throughputRange: [70, 140],
    uptimeRange: [99.6, 99.97],
  },
}

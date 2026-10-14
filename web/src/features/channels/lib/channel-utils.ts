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
import {
  CHANNEL_STATUS_CONFIG,
  CHANNEL_TYPES,
  MULTI_KEY_STATUS_CONFIG,
  TYPE_TO_KEY_PROMPT,
} from '../constants'
import type { Channel, ChannelSettings, ChannelOtherSettings } from '../types'

// ============================================================================
// Channel Type Utilities
// ============================================================================

/**
 * Get human-readable channel type label
 */
export function getChannelTypeLabel(type: number): string {
  return CHANNEL_TYPES[type as keyof typeof CHANNEL_TYPES] || 'Unknown'
}

/**
 * Get channel type icon name for getLobeIcon
 * Maps channel types to Lobe icon names using type number (language-independent)
 */
export function getChannelTypeIcon(type: number): string {
  const TYPE_TO_ICON: Record<number, string> = {
    // OpenAI family
    1: 'OpenAI', // OpenAI
    6: 'OpenAI', // OpenAIMax
    7: 'OpenAI', // OhMyGPT
    8: 'OpenAI', // Custom
    58: 'NewAPI', // Advanced Custom
    59: 'Sub2API', // Sub2API
    60: 'NewAPI', // New API
    3: 'Azure', // Azure

    // Anthropic / Claude
    14: 'Claude', // Anthropic
    61: 'Claude', // Claude OAuth

    // Google family
    24: 'Gemini', // Gemini
    11: 'Google', // PaLM
    41: 'Gemini', // Vertex AI

    // Cloud providers
    33: 'Aws', // AWS
    39: 'Cloudflare', // Cloudflare

    // Chinese providers
    15: 'Baidu', // Baidu
    46: 'Baidu', // Baidu V2
    16: 'Zhipu', // Zhipu
    26: 'Zhipu', // Zhipu V4
    17: 'Qwen', // Ali
    18: 'Spark', // Xunfei
    23: 'Hunyuan', // Tencent
    19: 'Ai360', // 360
    25: 'Moonshot', // Moonshot
    31: 'Yi', // LingYiWanWu
    35: 'Minimax', // MiniMax
    45: 'Volcengine', // VolcEngine

    // Other AI providers
    4: 'Ollama', // Ollama
    27: 'Perplexity', // Perplexity
    34: 'Cohere', // Cohere
    42: 'Mistral', // Mistral
    43: 'DeepSeek', // DeepSeek
    48: 'XAI', // xAI
    49: 'Coze', // Coze
    40: 'SiliconCloud', // SiliconFlow
    44: 'OpenAI', // MokaAI
    20: 'OpenRouter', // OpenRouter

    // Image/Video generation
    2: 'Midjourney', // MjProxy
    5: 'Midjourney', // MjProxyPlus
    50: 'Kling', // Kling
    51: 'Jimeng', // Jimeng
    52: 'Vidu', // Vidu
    36: 'Suno', // SunoAPI
    55: 'OpenAI', // Sora
    54: 'Doubao', // DoubaoVideo
    56: 'Replicate', // Replicate

    // Tools & Platforms
    37: 'Dify', // Dify
    38: 'Jina', // Jina
    22: 'FastGPT', // FastGPT
    47: 'Xinference', // Xinference
    53: 'OpenAI', // Submodel

    // AI Proxy services
    10: 'OpenAI', // AI Proxy
    21: 'OpenAI', // AI Proxy Library
    12: 'OpenAI', // API2GPT
    13: 'OpenAI', // AIGC2D
    9: 'OpenAI', // AILS
  }

  return TYPE_TO_ICON[type] || 'OpenAI'
}

// ============================================================================
// Status Utilities
// ============================================================================

/**
 * Get status badge configuration
 */
export function getChannelStatusBadge(status: number) {
  return (
    CHANNEL_STATUS_CONFIG[status as keyof typeof CHANNEL_STATUS_CONFIG] ||
    CHANNEL_STATUS_CONFIG[0]
  )
}

/**
 * Get multi-key status badge configuration
 */
export function getMultiKeyStatusBadge(status: number) {
  return (
    MULTI_KEY_STATUS_CONFIG[status as keyof typeof MULTI_KEY_STATUS_CONFIG] ||
    MULTI_KEY_STATUS_CONFIG[1]
  )
}

/**
 * Check if channel is enabled
 */
export function isChannelEnabled(channel: Channel): boolean {
  return channel.status === 1
}

/**
 * Check if channel is multi-key
 */
export function isMultiKeyChannel(channel: Channel): boolean {
  return channel.channel_info?.is_multi_key || false
}

// ============================================================================
// Key Formatting
// ============================================================================

/**
 * Format channel key for display
 * Masks the key for security, showing only first and last few characters
 */
export function formatChannelKey(
  key: string,
  isMultiKey: boolean = false
): string {
  if (!key) {
    return ''
  }

  if (isMultiKey) {
    const keys = key.split('\n').filter((k) => k.trim())
    return `${keys.length} keys`
  }

  if (key.length <= 16) {
    // For short keys, mask middle part
    return `${key.slice(0, 4)}...${key.slice(-4)}`
  }

  // For longer keys, show more context
  return `${key.slice(0, 8)}...${key.slice(-8)}`
}

/**
 * Format key preview for multi-key display
 */
export function formatKeyPreview(key: string, maxLength: number = 10): string {
  if (!key) {
    return ''
  }
  if (key.length <= maxLength) {
    return key
  }
  return `${key.slice(0, maxLength)}...`
}

/**
 * Count keys in multi-key string
 */
export function countKeys(key: string): number {
  if (!key) {
    return 0
  }
  return key.split('\n').filter((k) => k.trim()).length
}

// ============================================================================
// Model & Group Parsing
// ============================================================================

/**
 * Parse comma-separated models list
 */
export function parseModelsList(models: string): string[] {
  if (!models) {
    return []
  }
  return models
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
}

/**
 * Parse comma-separated groups list.
 * Sorts with 'default' group first, then locale-sorted alphabetically.
 */
export function parseGroupsList(groups: string): string[] {
  if (!groups) {
    return []
  }
  const list = groups
    .split(',')
    .map((g) => g.trim())
    .filter((g) => g.length > 0)
  return list.sort((a, b) => {
    if (a === 'default') {
      return -1
    }
    if (b === 'default') {
      return 1
    }
    return a.localeCompare(b)
  })
}

/**
 * Format models array back to string
 */
export function formatModelsString(models: string[]): string {
  return models.join(',')
}

/**
 * Format groups array back to string
 */
export function formatGroupsString(groups: string[]): string {
  return groups.join(',')
}

// ============================================================================
// Settings Parsing
// ============================================================================

/**
 * Parse channel settings JSON
 */
export function parseChannelSettings(
  settingStr: string | null | undefined
): ChannelSettings {
  if (!settingStr) {
    return {}
  }
  try {
    return JSON.parse(settingStr) as ChannelSettings
  } catch {
    return {}
  }
}

/**
 * Parse channel other settings JSON
 */
export function parseChannelOtherSettings(
  settingsStr: string | null | undefined
): ChannelOtherSettings {
  if (!settingsStr || settingsStr === '{}') {
    return {}
  }
  try {
    return JSON.parse(settingsStr) as ChannelOtherSettings
  } catch {
    return {}
  }
}

/**
 * Validate JSON string
 */
export function validateChannelSettings(settings: string): boolean {
  if (!settings || settings.trim() === '') {
    return true
  }
  try {
    JSON.parse(settings)
    return true
  } catch {
    return false
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate channel name
 */
export function validateChannelName(name: string): boolean {
  return name.trim().length > 0
}

/**
 * Validate API key format
 */
export function validateApiKey(key: string): boolean {
  return key.trim().length > 0
}

/**
 * Validate models list
 */
export function validateModels(models: string): boolean {
  return parseModelsList(models).length > 0
}

/**
 * Validate groups list
 */
export function validateGroups(groups: string): boolean {
  return parseGroupsList(groups).length > 0
}

/**
 * Check if channel needs attention (low balance, auto-disabled, etc.)
 */
export function channelNeedsAttention(channel: Channel): boolean {
  // Auto-disabled
  if (channel.status === 3) {
    return true
  }

  // Low balance (less than $1)
  if (channel.balance > 0 && channel.balance < 1) {
    return true
  }

  // Multi-key channel with all keys disabled
  if (
    channel.channel_info?.is_multi_key &&
    channel.channel_info.multi_key_status_list &&
    Object.keys(channel.channel_info.multi_key_status_list).length >=
      channel.channel_info.multi_key_size
  ) {
    return true
  }

  return false
}

/**
 * Get attention reason for channel
 */
export function getAttentionReason(channel: Channel): string | null {
  if (channel.status === 3) {
    return 'Auto-disabled'
  }
  if (channel.balance > 0 && channel.balance < 1) {
    return 'Low balance'
  }
  if (
    channel.channel_info?.is_multi_key &&
    channel.channel_info.multi_key_status_list &&
    Object.keys(channel.channel_info.multi_key_status_list).length >=
      channel.channel_info.multi_key_size
  ) {
    return 'All keys disabled'
  }
  return null
}

// ============================================================================
// Key Management Utilities
// ============================================================================

/**
 * Deduplicate keys from a multiline string
 * @param keysText - Text with one key per line
 * @returns Object with deduplicated keys and statistics
 */
export function deduplicateKeys(keysText: string): {
  deduplicatedText: string
  beforeCount: number
  afterCount: number
  removedCount: number
} {
  if (!keysText || keysText.trim() === '') {
    return {
      deduplicatedText: '',
      beforeCount: 0,
      afterCount: 0,
      removedCount: 0,
    }
  }

  // Split by lines
  const keyLines = keysText.split('\n')
  const beforeCount = keyLines.length

  // Use Set for deduplication, maintaining order
  const keySet = new Set<string>()
  const deduplicatedKeys: string[] = []

  keyLines.forEach((line) => {
    const trimmedLine = line.trim()
    if (trimmedLine && !keySet.has(trimmedLine)) {
      keySet.add(trimmedLine)
      deduplicatedKeys.push(trimmedLine)
    }
  })

  const afterCount = deduplicatedKeys.length
  const deduplicatedText = deduplicatedKeys.join('\n')

  return {
    deduplicatedText,
    beforeCount,
    afterCount,
    removedCount: beforeCount - afterCount,
  }
}

/**
 * Get key prompt based on channel type
 */
export function getKeyPromptForType(type: number): string {
  return TYPE_TO_KEY_PROMPT[type] || 'Enter API key for this channel'
}

export {
  formatBalance,
  getBalanceVariant,
  formatResponseTime,
  getResponseTimeConfig,
  formatRelativeTime,
  formatTimestamp,
  formatQuota,
  getPriorityDisplay,
  getWeightDisplay,
} from './channel-display'
export {
  type TagRow,
  isTagAggregateRow,
  getChannelTableRowId,
  aggregateChannelsByTag,
} from './channel-tags'

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

export type TelemetryHealth = 'healthy' | 'degraded' | 'offline'

export type ServerCpuCore = {
  id: number
  architecture: string
  usagePercent: number
  currentFrequencyMhz: number | null
  maximumFrequencyMhz: number | null
}

export type ServerStoragePool = {
  id: string
  label: string
  level: string
  health: TelemetryHealth
  capacityBytes: number
  usedBytes: number
  usagePercent: number
  activeMembers: number
  totalMembers: number
}

export type ServerNetwork = {
  id: string
  label: string
  receivedBytes: number
  sentBytes: number
  receivedBytesPerSecond: number
  sentBytesPerSecond: number
}

export type ServerTelemetrySnapshot = {
  schemaVersion: 4
  generatedAtEpochSeconds: number
  system: {
    hostname: string
    boardModel: string
    architecture: string
    uptimeSeconds: number
  }
  cpu: {
    usagePercent: number
    temperatureCelsius: number | null
    cores: ServerCpuCore[]
  }
  memory: {
    totalBytes: number
    usedBytes: number
    usagePercent: number
  }
  docker: {
    health: TelemetryHealth
    version: string | null
    totalContainers: number
    runningContainers: number
    healthyContainers: number
    startingContainers: number
    unhealthyContainers: number
    unmonitoredContainers: number
  }
  storagePools: ServerStoragePool[]
  networks: ServerNetwork[]
}

export type ServerTelemetryConnection = 'connecting' | 'online' | 'reconnecting'

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isTelemetryHealth(value: unknown): value is TelemetryHealth {
  return value === 'healthy' || value === 'degraded' || value === 'offline'
}

function isCpuCore(value: unknown): value is ServerCpuCore {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.architecture === 'string' &&
    isFiniteNumber(value.usagePercent) &&
    (value.currentFrequencyMhz === null ||
      isFiniteNumber(value.currentFrequencyMhz)) &&
    (value.maximumFrequencyMhz === null ||
      isFiniteNumber(value.maximumFrequencyMhz))
  )
}

function isStoragePool(value: unknown): value is ServerStoragePool {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.level === 'string' &&
    isTelemetryHealth(value.health) &&
    isFiniteNumber(value.capacityBytes) &&
    isFiniteNumber(value.usedBytes) &&
    isFiniteNumber(value.usagePercent) &&
    isFiniteNumber(value.activeMembers) &&
    isFiniteNumber(value.totalMembers)
  )
}

function isNetwork(value: unknown): value is ServerNetwork {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    isFiniteNumber(value.receivedBytes) &&
    isFiniteNumber(value.sentBytes) &&
    isFiniteNumber(value.receivedBytesPerSecond) &&
    isFiniteNumber(value.sentBytesPerSecond)
  )
}

export function isServerTelemetrySnapshot(
  value: unknown
): value is ServerTelemetrySnapshot {
  if (!isRecord(value) || value.schemaVersion !== 4) return false

  const system = value.system
  const cpu = value.cpu
  const memory = value.memory
  const docker = value.docker
  return (
    isFiniteNumber(value.generatedAtEpochSeconds) &&
    isRecord(system) &&
    typeof system.hostname === 'string' &&
    typeof system.boardModel === 'string' &&
    typeof system.architecture === 'string' &&
    isFiniteNumber(system.uptimeSeconds) &&
    isRecord(cpu) &&
    isFiniteNumber(cpu.usagePercent) &&
    (cpu.temperatureCelsius === null ||
      isFiniteNumber(cpu.temperatureCelsius)) &&
    Array.isArray(cpu.cores) &&
    cpu.cores.every(isCpuCore) &&
    isRecord(memory) &&
    isFiniteNumber(memory.totalBytes) &&
    isFiniteNumber(memory.usedBytes) &&
    isFiniteNumber(memory.usagePercent) &&
    isRecord(docker) &&
    isTelemetryHealth(docker.health) &&
    (docker.version === null || typeof docker.version === 'string') &&
    isFiniteNumber(docker.totalContainers) &&
    isFiniteNumber(docker.runningContainers) &&
    isFiniteNumber(docker.healthyContainers) &&
    isFiniteNumber(docker.startingContainers) &&
    isFiniteNumber(docker.unhealthyContainers) &&
    isFiniteNumber(docker.unmonitoredContainers) &&
    Array.isArray(value.storagePools) &&
    value.storagePools.every(isStoragePool) &&
    Array.isArray(value.networks) &&
    value.networks.every(isNetwork)
  )
}

export function formatTelemetryBytes(bytes: number): string {
  const safeBytes = Math.max(0, Number(bytes) || 0)
  if (safeBytes === 0) return '0 B'
  const unitIndex = Math.min(
    Math.floor(Math.log(safeBytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  )
  const value = safeBytes / 1024 ** unitIndex
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${BYTE_UNITS[unitIndex]}`
}

export function formatTelemetryRate(bytesPerSecond: number): string {
  return `${formatTelemetryBytes(bytesPerSecond)}/s`
}

export function formatTelemetryUptime(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return [
    days > 0 ? `${days}d` : '',
    hours > 0 ? `${hours}h` : '',
    `${minutes}m`,
  ]
    .filter(Boolean)
    .join(' ')
}

export function summarizeCpuArchitectures(cores: ServerCpuCore[]): string {
  const counts = new Map<string, number>()
  for (const core of cores) {
    counts.set(core.architecture, (counts.get(core.architecture) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([architecture, count]) => `${architecture} ×${count}`)
    .join(' · ')
}

export function getNewApiNetwork(
  snapshot: ServerTelemetrySnapshot
): ServerNetwork | null {
  return (
    snapshot.networks.find(
      (network) => network.label === 'Docker 网络 · new-api'
    ) ?? null
  )
}

export function getRaidStoragePool(
  snapshot: ServerTelemetrySnapshot
): ServerStoragePool | null {
  return (
    snapshot.storagePools.find(
      (pool) => pool.id === 'md0' || pool.level === 'RAID1'
    ) ?? null
  )
}

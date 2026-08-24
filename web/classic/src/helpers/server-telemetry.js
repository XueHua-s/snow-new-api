/*
Copyright (C) 2025 QuantumNous

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

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

const isCpuCore = (value) =>
  isRecord(value) &&
  isFiniteNumber(value.id) &&
  typeof value.architecture === 'string' &&
  isFiniteNumber(value.usagePercent) &&
  (value.currentFrequencyMhz === null ||
    isFiniteNumber(value.currentFrequencyMhz)) &&
  (value.maximumFrequencyMhz === null ||
    isFiniteNumber(value.maximumFrequencyMhz));

const isStoragePool = (value) =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string' &&
  typeof value.level === 'string' &&
  typeof value.health === 'string' &&
  isFiniteNumber(value.capacityBytes) &&
  isFiniteNumber(value.usedBytes) &&
  isFiniteNumber(value.usagePercent) &&
  isFiniteNumber(value.activeMembers) &&
  isFiniteNumber(value.totalMembers);

const isNetwork = (value) =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string' &&
  isFiniteNumber(value.receivedBytes) &&
  isFiniteNumber(value.sentBytes) &&
  isFiniteNumber(value.receivedBytesPerSecond) &&
  isFiniteNumber(value.sentBytesPerSecond);

export const isServerTelemetrySnapshot = (value) =>
  isRecord(value) &&
  value.schemaVersion === 4 &&
  isFiniteNumber(value.generatedAtEpochSeconds) &&
  isRecord(value.system) &&
  typeof value.system.hostname === 'string' &&
  typeof value.system.boardModel === 'string' &&
  typeof value.system.architecture === 'string' &&
  isFiniteNumber(value.system.uptimeSeconds) &&
  isRecord(value.cpu) &&
  isFiniteNumber(value.cpu.usagePercent) &&
  (value.cpu.temperatureCelsius === null ||
    isFiniteNumber(value.cpu.temperatureCelsius)) &&
  Array.isArray(value.cpu.cores) &&
  value.cpu.cores.every(isCpuCore) &&
  isRecord(value.memory) &&
  isFiniteNumber(value.memory.totalBytes) &&
  isFiniteNumber(value.memory.usedBytes) &&
  isFiniteNumber(value.memory.usagePercent) &&
  isRecord(value.docker) &&
  typeof value.docker.health === 'string' &&
  (value.docker.version === null || typeof value.docker.version === 'string') &&
  isFiniteNumber(value.docker.totalContainers) &&
  isFiniteNumber(value.docker.runningContainers) &&
  isFiniteNumber(value.docker.healthyContainers) &&
  isFiniteNumber(value.docker.startingContainers) &&
  isFiniteNumber(value.docker.unhealthyContainers) &&
  isFiniteNumber(value.docker.unmonitoredContainers) &&
  Array.isArray(value.storagePools) &&
  value.storagePools.every(isStoragePool) &&
  Array.isArray(value.networks) &&
  value.networks.every(isNetwork);

export const formatTelemetryBytes = (bytes) => {
  const safeBytes = Math.max(0, Number(bytes) || 0);
  if (safeBytes === 0) return '0 B';
  const unitIndex = Math.min(
    Math.floor(Math.log(safeBytes) / Math.log(1024)),
    BYTE_UNITS.length - 1,
  );
  const value = safeBytes / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${BYTE_UNITS[unitIndex]}`;
};

export const formatTelemetryRate = (bytesPerSecond) =>
  `${formatTelemetryBytes(bytesPerSecond)}/s`;

export const formatTelemetryUptime = (seconds) => {
  const totalMinutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [
    days > 0 ? `${days}d` : '',
    hours > 0 ? `${hours}h` : '',
    `${minutes}m`,
  ]
    .filter(Boolean)
    .join(' ');
};

export const summarizeCpuArchitectures = (cores) => {
  const counts = new Map();
  cores.forEach((core) => {
    counts.set(core.architecture, (counts.get(core.architecture) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([architecture, count]) => `${architecture} ×${count}`)
    .join(' · ');
};

export const getNewApiNetwork = (snapshot) =>
  snapshot.networks.find(
    (network) => network.label === 'Docker 网络 · new-api',
  ) || null;

export const getRaidStoragePool = (snapshot) =>
  snapshot.storagePools.find(
    (pool) => pool.id === 'md0' || pool.level === 'RAID1',
  ) || null;

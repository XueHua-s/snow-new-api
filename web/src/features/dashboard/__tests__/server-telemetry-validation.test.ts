import { describe, expect, it } from 'vitest'

import { isServerTelemetrySnapshot } from '../server-telemetry'

const schemaV5Snapshot = {
  schemaVersion: 5,
  generatedAtEpochSeconds: 1_787_814_656,
  system: {
    hostname: 'armbian',
    boardModel: 'OneThing Cloud OES',
    architecture: 'arm64',
    uptimeSeconds: 417_153,
  },
  cpu: {
    usagePercent: 7.2,
    temperatureCelsius: 46.7,
    cores: [
      {
        id: 0,
        architecture: 'Cortex-A53',
        usagePercent: 6.1,
        currentFrequencyMhz: 1_398,
        maximumFrequencyMhz: 1_800,
      },
    ],
  },
  memory: {
    totalBytes: 3_848_585_216,
    usedBytes: 1_328_390_144,
    usagePercent: 34.5,
  },
  docker: {
    health: 'healthy',
    version: '20.10.24+dfsg1',
    totalContainers: 5,
    runningContainers: 5,
    healthyContainers: 5,
    startingContainers: 0,
    unhealthyContainers: 0,
    unmonitoredContainers: 0,
  },
  storagePools: [
    {
      id: 'md0',
      label: 'RAID1 data pool',
      level: 'RAID1',
      health: 'healthy',
      capacityBytes: 235_000_909_824,
      usedBytes: 27_210_002_432,
      usagePercent: 11.6,
      activeMembers: 2,
      totalMembers: 2,
    },
  ],
  disks: [
    {
      id: 'sda',
      label: 'External SSD',
      model: 'CF500 240GB',
      capacityBytes: 240_057_409_536,
      usedBytes: 27_210_002_432,
      usagePercent: 11.3,
      readBytes: 263_484_813_824,
      writtenBytes: 325_677_776_384,
      readBytesPerSecond: 0,
      writtenBytesPerSecond: 1_317_667,
    },
  ],
  networks: [
    {
      id: 'eth0',
      label: 'Primary network',
      receivedBytes: 57_632_859_844,
      sentBytes: 53_367_211_011,
      receivedBytesPerSecond: 3_572,
      sentBytesPerSecond: 3_166,
    },
  ],
}

describe('server telemetry validation', () => {
  it('accepts the schema v5 snapshot emitted by the production telemetry service', () => {
    expect(isServerTelemetrySnapshot(schemaV5Snapshot)).toBe(true)
  })

  it('rejects a schema v5 snapshot without its required disk telemetry', () => {
    const { disks: _disks, ...snapshotWithoutDisks } = schemaV5Snapshot

    expect(isServerTelemetrySnapshot(snapshotWithoutDisks)).toBe(false)
  })

  it('keeps accepting schema v4 snapshots during a rolling deployment', () => {
    const { disks: _disks, ...snapshotWithoutDisks } = schemaV5Snapshot
    const schemaV4Snapshot = { ...snapshotWithoutDisks, schemaVersion: 4 }

    expect(isServerTelemetrySnapshot(schemaV4Snapshot)).toBe(true)
  })
})

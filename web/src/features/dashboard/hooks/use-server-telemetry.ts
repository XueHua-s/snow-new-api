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
import { useEffect, useState } from 'react'
import {
  isServerTelemetrySnapshot,
  type ServerTelemetryConnection,
  type ServerTelemetrySnapshot,
} from '../server-telemetry'

const SERVER_STATUS_WS_URL = 'wss://proxy.xhblog.top:9443/status/ws'
const HEARTBEAT_TIMEOUT_MS = 3500
const MAX_RECONNECT_DELAY_MS = 30000

export function useServerTelemetry(): {
  snapshot: ServerTelemetrySnapshot | null
  connection: ServerTelemetryConnection
} {
  const [snapshot, setSnapshot] = useState<ServerTelemetrySnapshot | null>(null)
  const [connection, setConnection] =
    useState<ServerTelemetryConnection>('connecting')

  useEffect(() => {
    let disposed = false
    let socket: WebSocket | null = null
    let reconnectTimer: number | undefined
    let heartbeatTimer: number | undefined
    let reconnectAttempt = 0

    const clearTimers = () => {
      window.clearTimeout(reconnectTimer)
      window.clearTimeout(heartbeatTimer)
    }

    const scheduleHeartbeatWatchdog = () => {
      window.clearTimeout(heartbeatTimer)
      heartbeatTimer = window.setTimeout(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.close(4000, 'telemetry heartbeat timeout')
        }
      }, HEARTBEAT_TIMEOUT_MS)
    }

    const connect = () => {
      if (disposed || document.visibilityState === 'hidden') return

      setConnection(reconnectAttempt === 0 ? 'connecting' : 'reconnecting')
      socket = new WebSocket(SERVER_STATUS_WS_URL)

      socket.addEventListener('open', () => {
        if (disposed) return
        reconnectAttempt = 0
        setConnection('online')
        scheduleHeartbeatWatchdog()
      })

      socket.addEventListener('message', (event: MessageEvent<string>) => {
        if (disposed) return
        try {
          const payload: unknown = JSON.parse(String(event.data))
          if (isServerTelemetrySnapshot(payload)) {
            setSnapshot(payload)
            scheduleHeartbeatWatchdog()
          }
        } catch {
          // Keep the last valid snapshot; a later frame can recover the stream.
        }
      })

      socket.addEventListener('error', () => socket?.close())
      socket.addEventListener('close', () => {
        window.clearTimeout(heartbeatTimer)
        if (disposed || document.visibilityState === 'hidden') return

        reconnectAttempt += 1
        setConnection('reconnecting')
        const delay = Math.min(
          1000 * 2 ** Math.min(reconnectAttempt, 5),
          MAX_RECONNECT_DELAY_MS
        )
        reconnectTimer = window.setTimeout(connect, delay)
      })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimers()
        socket?.close(1000, 'dashboard hidden')
        return
      }
      reconnectAttempt = 0
      connect()
    }

    connect()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      clearTimers()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      socket?.close(1000, 'dashboard closed')
    }
  }, [])

  return { snapshot, connection }
}

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
import { useAuthStore } from '@/stores/auth-store'
import type {
  ChannelStatusConnection,
  ChannelStatusPulse,
  ChannelStatusSocketMessage,
} from '../types'

const HEARTBEAT_TIMEOUT_MS = 3500
const MAX_RECONNECT_DELAY_MS = 10000

function buildSocketUrl(windowSeconds: number): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const query = new URLSearchParams({ window: String(windowSeconds) })
  return `${protocol}//${window.location.host}/api/channel-status/ws?${query}`
}

export function useChannelStatusSocket(windowSeconds: number): {
  data: ChannelStatusPulse | null
  error: boolean
  connection: ChannelStatusConnection
  lastHeartbeat: number
} {
  const [data, setData] = useState<ChannelStatusPulse | null>(null)
  const [error, setError] = useState(false)
  const [connection, setConnection] =
    useState<ChannelStatusConnection>('connecting')
  const [lastHeartbeat, setLastHeartbeat] = useState(0)

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
          socket.close(4000, 'heartbeat timeout')
        }
      }, HEARTBEAT_TIMEOUT_MS)
    }

    const connect = () => {
      if (disposed || document.visibilityState === 'hidden') return

      setConnection(reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
      const accessToken = useAuthStore.getState().auth.accessToken
      if (!accessToken) {
        setError(true)
        setConnection('reconnecting')
        return
      }
      socket = new WebSocket(buildSocketUrl(windowSeconds), [
        'new-api-bearer',
        accessToken,
      ])

      socket.onopen = () => {
        if (disposed) return
        reconnectAttempt = 0
        setConnection('connected')
        scheduleHeartbeatWatchdog()
      }

      socket.onmessage = (event: MessageEvent<string>) => {
        if (disposed) return
        try {
          const message = JSON.parse(event.data) as ChannelStatusSocketMessage
          setLastHeartbeat(message.timestamp_ms || Date.now())
          scheduleHeartbeatWatchdog()
          if (message.data) setData(message.data)
          setError(Boolean(message.error || message.data?.error))
        } catch {
          setError(true)
        }
      }

      socket.onerror = () => {
        if (!disposed) setConnection('reconnecting')
      }

      socket.onclose = () => {
        window.clearTimeout(heartbeatTimer)
        if (disposed || document.visibilityState === 'hidden') return

        reconnectAttempt += 1
        setConnection('reconnecting')
        const delay = Math.min(
          1000 * 2 ** Math.min(reconnectAttempt - 1, 3),
          MAX_RECONNECT_DELAY_MS
        )
        reconnectTimer = window.setTimeout(connect, delay)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimers()
        socket?.close(1000, 'page hidden')
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
      socket?.close(1000, 'page changed')
    }
  }, [windowSeconds])

  return { data, error, connection, lastHeartbeat }
}

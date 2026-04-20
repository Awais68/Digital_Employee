import { useEffect, useCallback } from 'react'

export function useWebSocket(onMessage) {
  useEffect(() => {
    // Get the current host (localhost:3000, etc)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}`
    
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('[WebSocket] Connected')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessage(data)
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error)
    }

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected')
      // Attempt reconnect after 3 seconds
      setTimeout(() => {
        console.log('[WebSocket] Attempting to reconnect...')
      }, 3000)
    }

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [onMessage])
}

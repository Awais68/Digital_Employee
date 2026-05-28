import { useState, useEffect, useRef, useCallback } from 'react'

export function useWebSocket(onMessage) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const retryCountRef = useRef(0)
  const onMessageRef = useRef(onMessage)
  const maxRetries = 10
  const baseDelay = 1000

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = window.location.hostname === 'localhost'
      ? `${protocol}//${window.location.host}/ws`
      : `${protocol}//${window.location.host}`
    
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[WebSocket] Connected')
      retryCountRef.current = 0
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessageRef.current(data)
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error)
    }

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected')
      setIsConnected(false)
      
      if (retryCountRef.current < maxRetries) {
        const delay = Math.min(baseDelay * Math.pow(2, retryCountRef.current), 30000)
        retryCountRef.current++
        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${retryCountRef.current}/${maxRetries})`)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          if (wsRef.current === ws) {
            connect()
          }
        }, delay)
      } else {
        console.error('[WebSocket] Max reconnection attempts reached')
      }
    }
  }, [])

  useEffect(() => {
    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close()
      }
    }
  }, [connect])

  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    } else {
      console.warn('[WebSocket] Cannot send message: connection not open')
    }
  }, [])

  return { sendMessage, isConnected }
}

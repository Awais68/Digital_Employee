import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SERVER_PORTS = [3000, 3001, 3002, 3003]

function findServerPort(ports, index = 0) {
  if (index >= ports.length) return ports[0]
  const net = require('net')
  return new Promise((resolve) => {
    const socket = net.createConnection({ port: ports[index], host: 'localhost' })
    socket.on('connect', () => {
      socket.end()
      console.log(`[Vite Proxy] Backend found on port ${ports[index]}`)
      resolve(ports[index])
    })
    socket.on('error', () => {
      resolve(findServerPort(ports, index + 1))
    })
  })
}

export default defineConfig(async () => {
  const serverPort = await findServerPort(SERVER_PORTS)
  
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true,
        },
        '/ws': {
          target: `ws://localhost:${serverPort}`,
          ws: true,
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: false
    }
  }
})

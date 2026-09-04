import { spawn } from 'child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MCP_DIR = path.resolve(__dirname, '../../../mcp_servers')

const connections = {}

async function getClient(name) {
  if (connections[name]) return connections[name]

  const serverPath = path.join(MCP_DIR, `${name}-mcp`, 'index.js')
  const transport = new StdioClientTransport({
    command: 'node',
    args: [serverPath],
    env: { ...process.env },
  })

  const client = new Client({ name: 'vault-control', version: '1.0.0' })
  await client.connect(transport)
  connections[name] = client
  return client
}

export async function callMcpTool(serverName, toolName, args = {}) {
  const client = await getClient(serverName)
  const result = await Promise.race([
    client.callTool({ name: toolName, arguments: args }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('MCP call timed out after 60s')), 60000)
    ),
  ])
  const text = result.content?.[0]?.text || '{}'
  return JSON.parse(text)
}

export async function closeAll() {
  for (const [name, client] of Object.entries(connections)) {
    try { await client.close() } catch {}
    delete connections[name]
  }
}

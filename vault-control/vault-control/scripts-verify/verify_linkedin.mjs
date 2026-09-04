import { spawn } from 'child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const MCP_DIR = '/media/awais/6372445e-8fda-42fa-9034-61babd7dafd1/150 GB DATA TRANSFER/hackathon series/0 FTE Hackathon/digital_FTE_qwen/Digital_Employee/mcp_servers'
const transport = new StdioClientTransport({ command: 'node', args: [MCP_DIR + '/linkedin-mcp/index.js'] })
const client = new Client({ name: 'verify', version: '1.0.0' })
await client.connect(transport)
const res = await client.callTool({ name: 'get_linkedin_profile', arguments: {} })
console.log('RESULT:', res.content?.[0]?.text)
await client.close()
process.exit(0)

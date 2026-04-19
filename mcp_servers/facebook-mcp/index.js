#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load credentials
const credsPath = path.join(__dirname, '../../config/facebook_tokens.json');
let creds;
try {
  creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
} catch (error) {
  console.error(`Error loading credentials from ${credsPath}: ${error.message}`);
  process.exit(1);
}

const PAGE_ACCESS_TOKEN = creds.page_access_token;
const PAGE_ID = creds.page_id;
const FB_API_VERSION = 'v18.0';
const FB_BASE_URL = `https://graph.facebook.com/${FB_API_VERSION}`;

// MCP Server
const server = new Server(
  {
    name: "facebook-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'post_to_facebook',
        description: 'Post a message to Facebook Page',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to post'
            },
            link: {
              type: 'string',
              description: 'Optional link to include'
            }
          },
          required: ['message']
        }
      },
      {
        name: 'get_facebook_posts',
        description: 'Get recent posts from Facebook Page',
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Number of posts to retrieve (default: 10)',
              default: 10
            }
          }
        }
      },
      {
        name: 'get_facebook_insights',
        description: 'Get Facebook Page analytics',
        inputSchema: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              description: 'Metric to fetch (page_impressions, page_engaged_users, etc.)',
              default: 'page_impressions'
            },
            period: {
              type: 'string',
              description: 'Time period (day, week, days_28)',
              default: 'day'
            }
          }
        }
      },
      {
        name: 'delete_facebook_post',
        description: 'Delete a Facebook post',
        inputSchema: {
          type: 'object',
          properties: {
            post_id: {
              type: 'string',
              description: 'ID of the post to delete'
            }
          },
          required: ['post_id']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'post_to_facebook': {
        const postData = {
          message: args.message,
          access_token: PAGE_ACCESS_TOKEN
        };
        
        if (args.link) {
          postData.link = args.link;
        }
        
        const response = await axios.post(
          `${FB_BASE_URL}/${PAGE_ID}/feed`,
          postData
        );
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            post_id: response.data.id,
            message: 'Posted successfully to Facebook'
          }, null, 2) }]
        };
      }

      case 'get_facebook_posts': {
        const response = await axios.get(
          `${FB_BASE_URL}/${PAGE_ID}/posts`,
          {
            params: {
              access_token: PAGE_ACCESS_TOKEN,
              limit: args.limit || 10,
              fields: 'id,message,created_time,permalink_url,likes.summary(true),comments.summary(true)'
            }
          }
        );
        
        const posts = response.data.data.map(post => ({
          id: post.id,
          message: post.message,
          created_time: post.created_time,
          url: post.permalink_url,
          likes: post.likes?.summary?.total_count || 0,
          comments: post.comments?.summary?.total_count || 0
        }));
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            posts: posts,
            count: posts.length
          }, null, 2) }]
        };
      }

      case 'get_facebook_insights': {
        const response = await axios.get(
          `${FB_BASE_URL}/${PAGE_ID}/insights`,
          {
            params: {
              access_token: PAGE_ACCESS_TOKEN,
              metric: args.metric || 'page_impressions',
              period: args.period || 'day'
            }
          }
        );
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            insights: response.data.data
          }, null, 2) }]
        };
      }

      case 'delete_facebook_post': {
        await axios.delete(
          `${FB_BASE_URL}/${args.post_id}`,
          {
            params: {
              access_token: PAGE_ACCESS_TOKEN
            }
          }
        );
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            message: 'Post deleted successfully'
          }, null, 2) }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({
        success: false,
        error: error.response?.data || error.message
      }, null, 2) }],
      isError: true
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Facebook MCP Server running...');

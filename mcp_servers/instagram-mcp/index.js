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
const configPath = path.join(__dirname, '../../config/instagram_config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error(`Error loading configuration from ${configPath}: ${error.message}`);
  process.exit(1);
}

const IG_USER_ID = config.instagram_business_account_id;
const ACCESS_TOKEN = config.page_access_token;
const IG_API_VERSION = 'v18.0';
const IG_BASE_URL = `https://graph.facebook.com/${IG_API_VERSION}`;

// MCP Server
const server = new Server(
  {
    name: "instagram-mcp",
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
        name: 'post_to_instagram',
        description: 'Post an image to Instagram with caption',
        inputSchema: {
          type: 'object',
          properties: {
            image_url: {
              type: 'string',
              description: 'Public URL of the image to post'
            },
            caption: {
              type: 'string',
              description: 'Caption for the post'
            }
          },
          required: ['image_url', 'caption']
        }
      },
      {
        name: 'get_instagram_posts',
        description: 'Get recent Instagram posts',
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
        name: 'get_instagram_insights',
        description: 'Get Instagram account insights',
        inputSchema: {
          type: 'object',
          properties: {
            metric: {
              type: 'string',
              description: 'Metric to fetch (impressions, reach, profile_views, etc.)',
              default: 'impressions'
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
        name: 'get_instagram_profile',
        description: 'Get Instagram business account profile information',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'reply_instagram_comment',
        description: 'Reply to a comment on Instagram',
        inputSchema: {
          type: 'object',
          properties: {
            comment_id: {
              type: 'string',
              description: 'ID of the comment to reply to'
            },
            message: {
              type: 'string',
              description: 'Reply message'
            }
          },
          required: ['comment_id', 'message']
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
      case 'post_to_instagram': {
        // Step 1: Create container
        const containerResponse = await axios.post(
          `${IG_BASE_URL}/${IG_USER_ID}/media`,
          {
            image_url: args.image_url,
            caption: args.caption,
            access_token: ACCESS_TOKEN
          }
        );
        
        const creationId = containerResponse.data.id;
        
        // Step 2: Publish container
        // Wait a bit for media to process
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const publishResponse = await axios.post(
          `${IG_BASE_URL}/${IG_USER_ID}/media_publish`,
          {
            creation_id: creationId,
            access_token: ACCESS_TOKEN
          }
        );
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            post_id: publishResponse.data.id,
            message: 'Posted successfully to Instagram'
          }, null, 2) }]
        };
      }

      case 'get_instagram_posts': {
        const response = await axios.get(
          `${IG_BASE_URL}/${IG_USER_ID}/media`,
          {
            params: {
              access_token: ACCESS_TOKEN,
              limit: args.limit || 10,
              fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count'
            }
          }
        );
        
        const posts = response.data.data.map(post => ({
          id: post.id,
          caption: post.caption,
          media_type: post.media_type,
          url: post.permalink,
          timestamp: post.timestamp,
          likes: post.like_count || 0,
          comments: post.comments_count || 0
        }));
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            posts: posts,
            count: posts.length
          }, null, 2) }]
        };
      }

      case 'get_instagram_insights': {
        const response = await axios.get(
          `${IG_BASE_URL}/${IG_USER_ID}/insights`,
          {
            params: {
              access_token: ACCESS_TOKEN,
              metric: args.metric || 'impressions,reach',
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

      case 'get_instagram_profile': {
        const response = await axios.get(
          `${IG_BASE_URL}/${IG_USER_ID}`,
          {
            params: {
              access_token: ACCESS_TOKEN,
              fields: 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url'
            }
          }
        );
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            profile: response.data
          }, null, 2) }]
        };
      }

      case 'reply_instagram_comment': {
        const response = await axios.post(
          `${IG_BASE_URL}/${args.comment_id}/replies`,
          {
            message: args.message,
            access_token: ACCESS_TOKEN
          }
        );
        
        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            reply_id: response.data.id,
            message: 'Reply posted successfully'
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
console.error('Instagram MCP Server running...');

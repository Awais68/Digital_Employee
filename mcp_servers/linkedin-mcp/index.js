#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load credentials: env vars first, then config file
let ACCESS_TOKEN = process.env.LINKEDIN_ACCESS_TOKEN || ''
let USER_URN = process.env.LINKEDIN_URN || ''

const configPath = path.join(__dirname, '../../config/linkedin_config.json');
try {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!ACCESS_TOKEN) ACCESS_TOKEN = config.access_token
  if (!USER_URN) USER_URN = config.urn
} catch (error) {
  console.error(`LinkedIn config file not found at ${configPath}: ${error.message}`)
}

// Load mention config (name → URN mappings)
const mentionConfigPath = path.join(__dirname, '../../config/linkedin_mentions.json');
let MENTION_CONFIG = {};
try {
  MENTION_CONFIG = JSON.parse(fs.readFileSync(mentionConfigPath, 'utf8'));
} catch (error) {
  console.error(`LinkedIn mention config not found at ${mentionConfigPath}: ${error.message}`)
}

if (!ACCESS_TOKEN || ACCESS_TOKEN === 'your-linkedin-access-token') {
  console.error('LinkedIn MCP: LINKEDIN_ACCESS_TOKEN not set — post_to_linkedin will return 401')
}
if (!USER_URN || USER_URN === 'your-linkedin-urn') {
  console.error('LinkedIn MCP: LINKEDIN_URN not set — post_to_linkedin will fail')
}
const LINKEDIN_API = 'https://api.linkedin.com/v2';

function linkedinHeaders() {
  return {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    'X-Restli-Protocol-Version': '2.0.0',
  };
}

function makeUrn(urn) {
  if (urn.startsWith('urn:li:person:')) return urn;
  return `urn:li:person:${urn}`;
}

// Build attributes array for hashtags and mention annotations in UGC Posts
function buildAttributes(text) {
  const attributes = [];

  // Find hashtags
  const hashtagRe = /#(\w+)/g;
  let match;
  while ((match = hashtagRe.exec(text)) !== null) {
    attributes.push({
      start: match.index,
      length: match[0].length,
      entityType: 'HASHTAG',
      hashtag: { tag: match[1] },
    });
  }

  // Find @mentions and resolve via config
  const mentionRe = /@(\w+(?:\s+\w+)?)/g;
  while ((match = mentionRe.exec(text)) !== null) {
    const name = match[1];
    const entry = Object.entries(MENTION_CONFIG).find(
      ([key]) => key.toLowerCase() === name.toLowerCase()
    );
    if (entry) {
      const [, data] = entry;
      attributes.push({
        start: match.index,
        length: match[0].length,
        entityType: 'MEMBER',
        member: { urn: data.urn },
      });
    }
  }

  return attributes.length ? attributes : undefined;
}

// MCP Server
const server = new Server(
  {
    name: "linkedin-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'post_to_linkedin',
        description: 'Post a message (and optional image) to LinkedIn',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The text content to post' },
            image_url: { type: 'string', description: 'Public URL of an image to attach (optional)' },
          },
          required: ['text'],
        }
      },
      {
        name: 'get_linkedin_profile',
        description: 'Get LinkedIn profile information',
        inputSchema: { type: 'object', properties: {} },
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'post_to_linkedin': {
        const author = makeUrn(USER_URN);
        const headers = linkedinHeaders();

        const shareCommentary = { text: args.text };
        const attrs = buildAttributes(args.text);
        if (attrs) shareCommentary.attributes = attrs;

        if (!args.image_url) {
          // Text-only post
          const data = await axios.post(`${LINKEDIN_API}/ugcPosts`, {
            author,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary,
                shareMediaCategory: 'NONE',
              },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          }, { headers, validateStatus: () => true });

          if (data.status >= 400) {
            throw new Error(`LinkedIn API error: ${JSON.stringify(data.data).slice(0, 300)}`);
          }

          return {
            content: [{ type: 'text', text: JSON.stringify({
              success: true,
              post_id: data.data.id,
              post_url: `https://linkedin.com/feed/update/${data.data.id}`
            }, null, 2) }]
          };
        }

        // With image: register upload → upload → create post
        const register = await axios.post(`${LINKEDIN_API}/assets?action=registerUpload`, {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: author,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            }],
          },
        }, { headers, validateStatus: () => true });

        if (register.status >= 400) {
          throw new Error(`LinkedIn register error: ${JSON.stringify(register.data).slice(0, 300)}`);
        }

        const uploadUrl = register.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
        const asset = register.data.value.asset;

        // Download image and upload
        const imgRes = await axios.get(args.image_url, { responseType: 'arraybuffer', validateStatus: () => true });
        if (imgRes.status >= 400) throw new Error(`Failed to download image: HTTP ${imgRes.status}`);

        await axios.put(uploadUrl, Buffer.from(imgRes.data), {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            'Content-Type': 'image/jpeg',
          },
          validateStatus: () => true,
        });

        // Create post with image
        const post = await axios.post(`${LINKEDIN_API}/ugcPosts`, {
          author,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary,
              shareMediaCategory: 'IMAGE',
              media: [{
                status: 'READY',
                description: { text: '' },
                media: asset,
                title: { text: 'Post' },
              }],
            },
          },
          visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
        }, { headers, validateStatus: () => true });

        if (post.status >= 400) {
          throw new Error(`LinkedIn post error: ${JSON.stringify(post.data).slice(0, 300)}`);
        }

        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            post_id: post.data.id,
            post_url: `https://linkedin.com/feed/update/${post.data.id}`
          }, null, 2) }]
        };
      }

      case 'get_linkedin_profile': {
        const res = await axios.get(`${LINKEDIN_API}/me`, {
          headers: linkedinHeaders(),
          validateStatus: () => true,
        });
        if (res.status >= 400) throw new Error(`LinkedIn /me error: ${JSON.stringify(res.data).slice(0, 200)}`);

        return {
          content: [{ type: 'text', text: JSON.stringify({
            success: true,
            profile: res.data
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

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('LinkedIn MCP Server running...');

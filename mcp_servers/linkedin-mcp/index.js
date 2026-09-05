#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const configPath = path.join(__dirname, '../../config/linkedin_config.json');

// Load mention config (name → URN mappings)
const mentionConfigPath = path.join(__dirname, '../../config/linkedin_mentions.json');
let MENTION_CONFIG = {};
try {
  MENTION_CONFIG = JSON.parse(fs.readFileSync(mentionConfigPath, 'utf8'));
} catch (error) {
  console.error(`LinkedIn mention config not found at ${mentionConfigPath}: ${error.message}`)
}

const LINKEDIN_API = 'https://api.linkedin.com/v2';
const LINKEDIN_OAUTH = 'https://www.linkedin.com/oauth/v2/accessToken';

// ── Fresh credential loading ────────────────────────────────────────────────
// Critical: never cache the access token at module scope. A long-running MCP
// server that snapshots the token at startup keeps serving an expired token
// (401 EXPIRED_ACCESS_TOKEN) even after renew_linkedin_token.py or
// token_manager.py has rotated it on disk. Load fresh on every request and,
// on 401, try to auto-refresh with the refresh token when one is available.

let _refreshResultCache = null; // pauses concurrent refresh storms

function readLinkedinState() {
  let env = {};
  for (const ef of [path.join(__dirname, '../../.env'), path.join(__dirname, '../../vault-control/server/.env')]) {
    try {
      for (const line of fs.readFileSync(ef, 'utf8').split('\n')) {
        const m = line.trim().match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) env[m[1]] = m[2].trim();
      }
    } catch {}
  }

  let accessToken = process.env.LINKEDIN_ACCESS_TOKEN || env.LINKEDIN_ACCESS_TOKEN || '';
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {}
  if (!accessToken) accessToken = config.access_token || '';

  return {
    accessToken,
    refreshToken: env.LINKEDIN_REFRESH_TOKEN || '',
    clientId: env.LINKEDIN_CLIENT_ID || '',
    clientSecret: env.LINKEDIN_CLIENT_SECRET || '',
    userUrn: (process.env.LINKEDIN_URN || env.LINKEDIN_URN || config.urn || '').replace('urn:li:person:', ''),
  };
}

async function refreshAccessToken(state) {
  if (_refreshResultCache) return _refreshResultCache;
  if (!state.refreshToken || !state.clientId || !state.clientSecret) {
    _refreshResultCache = Promise.resolve({ ok: false, reason: 'no_refresh_token' });
    return _refreshResultCache;
  }
  _refreshResultCache = (async () => {
    try {
      const resp = await axios.post(LINKEDIN_OAUTH, new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: state.clientId,
        client_secret: state.clientSecret,
        refresh_token: state.refreshToken,
      }).toString(), { timeout: 20000, validateStatus: () => true });
      const d = resp.data;
      if (resp.status === 200 && d.access_token) {
        // Persist so every other consumer (orchestrator, token_manager, vault)
        // sees the fresh token too.
        const rotated = {
          ...state,
          accessToken: d.access_token,
          refreshToken: d.refresh_token || state.refreshToken,
        };
        for (const ef of [path.join(__dirname, '../../.env'), path.join(__dirname, '../../vault-control/server/.env')]) {
          try {
            const lines = fs.readFileSync(ef, 'utf8').split('\n');
            const out = [];
            const seen = new Set();
            for (const line of lines) {
              const m = line.trim().match(/^([A-Z0-9_]+)=/);
              if (m && (m[1] === 'LINKEDIN_ACCESS_TOKEN' || (m[1] === 'LINKEDIN_REFRESH_TOKEN' && rotated.refreshToken))) {
                out.push(`${m[1]}=${m[1] === 'LINKEDIN_ACCESS_TOKEN' ? rotated.accessToken : rotated.refreshToken}`);
                seen.add(m[1]);
                continue;
              }
              out.push(line);
            }
            if (!seen.has('LINKEDIN_ACCESS_TOKEN')) out.push(`LINKEDIN_ACCESS_TOKEN=${rotated.accessToken}`);
            if (!seen.has('LINKEDIN_REFRESH_TOKEN') && rotated.refreshToken) out.push(`LINKEDIN_REFRESH_TOKEN=${rotated.refreshToken}`);
            fs.writeFileSync(ef, out.join('\n') + '\n');
          } catch {}
        }
        try {
          fs.writeFileSync(configPath, JSON.stringify({ ...config, access_token: d.access_token, urn: rotated.userUrn }, null, 2));
        } catch {}
        try {
          const sessPath = path.join(__dirname, '../../.linkedin_session/session.json');
          const sess = JSON.parse(fs.readFileSync(sessPath, 'utf8'));
          sess.access_token = d.access_token;
          sess.refresh_token = d.refresh_token || sess.refresh_token || '';
          if (d.expires_in) {
            sess.expires_at = new Date(Date.now() + Number(d.expires_in) * 1000).toISOString();
          }
          fs.writeFileSync(sessPath, JSON.stringify(sess, null, 2));
        } catch {}
        return { ok: true, state: rotated };
      }
      return { ok: false, reason: `http_${resp.status}_${JSON.stringify(d).slice(0, 200)}` };
    } catch (e) {
      return { ok: false, reason: e.message };
    } finally {
      setTimeout(() => { _refreshResultCache = null }, 3000);
    }
  })();
  return _refreshResultCache;
}

// Make a LinkedIn request, auto-refreshing once on a 401, and always re-reading
// the freshest on-disk token first so an external rotation is picked up.
async function linkedinRequest(method, url, body, extraHeaders = {}) {
  const st = readLinkedinState();
  let accessToken = st.accessToken;
  let headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    ...extraHeaders,
  };

  const doRequest = async (tok, hdrs) => {
    const opts = { headers: hdrs, timeout: 20000, validateStatus: () => true };
    if (body !== undefined) opts.data = body;
    return axios.request({ method, url, ...opts });
  };

  let resp = await doRequest(accessToken, headers);

  if (resp.status === 401) {
    console.error('LinkedIn 401 received — attempting auto-refresh...');
    const refreshed = await refreshAccessToken(st);
    if (refreshed.ok) {
      const rotated = refreshed.state;
      headers.Authorization = `Bearer ${rotated.accessToken}`;
      resp = await doRequest(rotated.accessToken, headers);
    }
  }
  return resp;
}

function makeUrn(urn) {
  if (urn.startsWith('urn:li:person:')) return urn;
  return `urn:li:person:${urn}`;
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
        const st = readLinkedinState();
        const author = makeUrn(st.userUrn);

        const shareCommentary = { text: args.text };
        // NOTE: Attributes (hashtag/mention entities) intentionally omitted.
        // LinkedIn's UGC API v2 'value' field requires a scope our token lacks.
        // Hashtags and @mentions show as plain text in the post.

        if (!args.image_url) {
          // Text-only post
          const data = await linkedinRequest('post', `${LINKEDIN_API}/ugcPosts`, {
            author,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary,
                shareMediaCategory: 'NONE',
              },
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
          }, { 'Content-Type': 'application/json' });

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
        const registerHeaders = {
          Authorization: `Bearer ${readLinkedinState().accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'Content-Type': 'application/json',
        };
        const register = await linkedinRequest('post', `${LINKEDIN_API}/assets?action=registerUpload`, {
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: author,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent',
            }],
          },
        }, { 'Content-Type': 'application/json' });

        if (register.status >= 400) {
          throw new Error(`LinkedIn register error: ${JSON.stringify(register.data).slice(0, 300)}`);
        }

        const uploadUrl = register.data.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
        const asset = register.data.value.asset;

        // Download image and upload
        const imgRes = await axios.get(args.image_url, { responseType: 'arraybuffer', timeout: 60000, validateStatus: () => true });
        if (imgRes.status >= 400) throw new Error(`Failed to download image: HTTP ${imgRes.status}`);

        await axios.put(uploadUrl, Buffer.from(imgRes.data), {
          headers: {
            Authorization: `Bearer ${readLinkedinState().accessToken}`,
            'Content-Type': 'image/jpeg',
          },
          validateStatus: () => true,
        });

        // Create post with image
        const post = await linkedinRequest('post', `${LINKEDIN_API}/ugcPosts`, {
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
        }, { 'Content-Type': 'application/json' });

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
        const res = await linkedinRequest('get', `${LINKEDIN_API}/userinfo`);
        if (res.status >= 400) throw new Error(`LinkedIn /userinfo error: ${JSON.stringify(res.data).slice(0, 200)}`);

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

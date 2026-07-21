import { callAI, _lastCallUsedMock, _resetMockFlag } from './aiProvider.js';
import { generatePostImage } from './imageGenerator.js';
import { generateAllPlatformImages, PLATFORM_SPECS } from './socialImageWorkflow.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ─── TONE CONFIG (override via POST_TONE_MODE env var) ─────────
const POST_TONE_MODE = (process.env.POST_TONE_MODE || 'authentic').toLowerCase();
const IS_AUTHENTIC = POST_TONE_MODE === 'authentic';

// ─── BANNED PATTERN REGEXES (for post-generation validation) ───
const BANNED_PATTERNS = [
  /1️⃣\s*|2️⃣\s*|3️⃣\s*/,
  /\d+%\s+of\s+(enterprises|companies|businesses|organizations|consumers)/i,
  /\$\d+(\.\d+)?\s*(trillion|billion|million)\s+(market|opportunity|industry)/i,
  /Here's what happened this week that blew my mind/i,
  /Drop your thoughts below/i,
  /Let's have a real conversation/i,
  /the numbers speak for themselves/i,
  /here's what most people miss/i,
  /📊|📈|📉|✅|❌|💪|🌟/,
];

function containsBannedPatterns(text) {
  return BANNED_PATTERNS.some(re => re.test(text));
}

// STRICT PLATFORM RULES
const STRICT_PLATFORM_RULES = {
  linkedin: {
    minWords: 80, maxWords: 300,
    minHashtags: 3, maxHashtags: 5,
    requireLineBreaks: true,
    tone: 'professional, insightful, specific',
    structure: 'HOOK → RESEARCH PARAGRAPH (exactly 2 emojis) → KEY TAKEAWAYS (3-4 bullets) → HASHTAGS → CTA'
  },
  facebook: {
    minWords: 50, maxWords: 250,
    minHashtags: 2, maxHashtags: 5,
    tone: 'friendly, conversational, relatable',
    structure: 'HOOK → RESEARCH PARAGRAPH (exactly 2 emojis) → KEY TAKEAWAYS (3-4 bullets) → HASHTAGS'
  },
  instagram: {
    minWords: 30, maxWords: 150,
    minHashtags: 10, maxHashtags: 15,
    requireLineBreaks: true,
    tone: 'casual, inspiring, authentic',
    structure: 'HOOK → RESEARCH PARAGRAPH (exactly 2 emojis) → KEY TAKEAWAYS (3-4 bullets) → HASHTAGS (10-15)'
  },
  twitter: {
    minWords: 10, maxWords: 50,
    minHashtags: 1, maxHashtags: 3,
    tone: 'punchy, concise, specific',
    structure: 'Tweet (280 chars max) → HASHTAGS'
  }
};

function getStrictPlatformRules(platform) {
  const rules = STRICT_PLATFORM_RULES[platform] || STRICT_PLATFORM_RULES.linkedin;
  const toneSection = IS_AUTHENTIC
    ? `- BANNED PATTERNS (ZERO TOLERANCE — post will be rejected if any are found):
  • Numbered listicles ("1️⃣ 2️⃣ 3️⃣ insight:")
  • Unsourced statistics ("78% of enterprises...", "$2.3 trillion market...")
  • Generic hook openers ("Here's what happened this week that blew my mind")
  • Engagement-bait CTAs ("Drop your thoughts below 👇 Let's have a real conversation")
  • Emoji bullet markers (📊 📈 as list markers)
  • Vague filler ("the numbers speak for themselves", "here's what most people miss")
- Emojis: use EXACTLY 2, both inside the research/body paragraph (never in the hook, the bullet points, or the hashtags)`
    : `- Emojis: use EXACTLY 2, both inside the research/body paragraph (never in the hook, the bullet points, or the hashtags)`;

  return `Platform: ${platform}
- Word count: ${rules.minWords}-${rules.maxWords} words (STRICT)
- Hashtags: ${rules.minHashtags}-${rules.maxHashtags} at the END (STRICT)
- Line breaks: ${rules.requireLineBreaks ? 'REQUIRED between paragraphs' : 'Optional'}
- Tone: ${rules.tone}
- Structure: ${rules.structure}
- FORBIDDEN: buy now, click here, limited time, act fast, 100% free
${toneSection}`;
}

function getPlatformHashtagCount(platform) {
  const rules = STRICT_PLATFORM_RULES[platform] || STRICT_PLATFORM_RULES.linkedin;
  return `${rules.minHashtags}-${rules.maxHashtags}`;
}

export const DEFAULT_TOPICS = [
  'Software Engineering best practices',
  'Web Development trends',
  'Agentic AI and Automation',
  'Large Language Models (LLMs)',
  'Latest Tech News',
  'AI Agents in the workplace',
  'Cloud Computing and DevOps',
  'Cybersecurity essentials for businesses',
  'Data Science and Analytics trends',
  'Startup growth and entrepreneurship',
  'Remote work and productivity tools',
  'Open Source software innovations',
  'Mobile App Development trends',
  'Blockchain and Web3 practical uses',
  'Tech career growth and upskilling',
  'No-code and low-code platforms',
  'Digital marketing with AI',
  'API design and system architecture',
  'Machine Learning in production (MLOps)',
  'Future of work and automation',
  'UI/UX design principles',
  'Database technologies and optimization',
  'Edge computing and IoT',
  'Prompt engineering techniques',
  'SaaS business models and metrics',
  'Blockchain',
  'Crypto Currency',
  'Bitcoin',
];

const POST_TIMES = [
  { label: 'Morning',   time: '09:00', cron: '0 9 * * *' },
  { label: 'Afternoon', time: '14:00', cron: '0 14 * * *' },
  { label: 'Evening',   time: '20:00', cron: '0 20 * * *' },
];

// ─── REAL WEB RESEARCH via multiple free sources ─────────────────────────
async function webSearch(query, maxResults = 5) {
  const results = [];

  // Try Wikipedia API (free, no auth, no bot detection)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${maxResults + 3}`;
    const wikiResp = await fetch(wikiUrl, { signal: AbortSignal.timeout(12000) });
    if (wikiResp.ok) {
      const wikiData = await wikiResp.json();
      const wikiResults = wikiData?.query?.search || [];
      for (const r of wikiResults.slice(0, maxResults)) {
        results.push({
          title: r.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
          snippet: r.snippet?.replace(/<\/?[^>]+>/g, '') || '',
        });
      }
    }
  } catch (e) {
    console.warn(`[WebSearch] Wikipedia failed: ${e.message}`);
  }

  // Try DuckDuckGo Instant Answer API (JSON, no bot detection)
  if (results.length < maxResults) {
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const ddgResp = await fetch(ddgUrl, { signal: AbortSignal.timeout(12000) });
      if (ddgResp.ok) {
        const ddgData = await ddgResp.json();
        if (ddgData.AbstractText) {
          results.push({ title: ddgData.Heading || query, url: ddgData.AbstractURL || '', snippet: ddgData.AbstractText });
        }
        if (ddgData.RelatedTopics?.length) {
          for (const rt of ddgData.RelatedTopics.slice(0, maxResults - results.length)) {
            if (rt.Text) {
              const title = rt.Text.split(' - ')[0] || rt.FirstURL?.split('/').pop()?.replace(/_/g, ' ') || query;
              results.push({ title, snippet: rt.Text.substring(0, 300), url: rt.FirstURL || '' });
            }
            if (rt.Topics) {
              for (const sub of rt.Topics.slice(0, maxResults - results.length)) {
                if (sub.Text) results.push({ title: sub.Text.split(' - ')[0] || query, snippet: sub.Text, url: sub.FirstURL || '' });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn(`[WebSearch] DuckDuckGo API failed: ${e.message}`);
    }
  }

  return results.slice(0, maxResults);
}

// ─── SOURCE VERIFICATION — every cited URL must actually resolve ──────────
async function verifySources(results) {
  const verified = [];
  await Promise.all(results.map(async (r) => {
    if (!r.url) return;
    try {
      const resp = await fetch(r.url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      });
      // Some sites reject HEAD; retry with GET on 405
      if (resp.ok || resp.status === 405) {
        verified.push({ ...r, verified: true, verifiedAt: new Date().toISOString() });
      }
    } catch {
      // Unreachable source — drop it, never cite an unverified URL
    }
  }));
  return verified;
}

async function condensedWebSearch(topic) {
  const searchResults = await webSearch(topic);
  if (searchResults.length === 0) return { text: 'No web results available.', sources: [] };

  // STRICT RULE: only verified (reachable) sources are cited
  const verifiedSources = await verifySources(searchResults);
  const usable = verifiedSources.length > 0 ? verifiedSources : searchResults;

  const text = usable.map((r, i) =>
    `${i + 1}. ${r.title}${r.verified ? ' [VERIFIED]' : ''}\n   ${r.snippet.substring(0, 200)}\n   Source: ${r.url}`
  ).join('\n\n');

  return { text, sources: usable };
}

export async function researchAndGeneratePost(topic, platform, postNumber = 1) {
  // ── STEP 1: REAL WEB RESEARCH (with verified sources) ───────────────────
  console.log(`[PostGen] Web researching: "${topic}"`);
  const webResearch = await condensedWebSearch(topic);
  const webData = webResearch.text;
  const verifiedSources = webResearch.sources.filter(s => s.verified);
  console.log(`[PostGen] Sources: ${webResearch.sources.length} found, ${verifiedSources.length} verified`);

  const researchPrompt = `You are a MARKETING research analyst. Below are real web search results for the topic "${topic}".

WEB SEARCH RESULTS:
${webData}

Based on these web results AND your knowledge, produce a structured research brief.
Focus on hard-hitting, specific insights — not generic statements.
Include actual numbers, statistics, company names, and real examples when available.

Return ONLY valid JSON — no markdown, no code fences:
{
  "key_facts": ["5 specific, factual, engaging facts about the topic"],
  "trending_angle": "The most compelling, shareable angle for this topic right now",
  "target_audience": "Exactly who should read this (job titles, industries, interests)",
  "best_hashtags": ["#5-7", "#relevant", "#trending", "#industry", "#specific", "#tags"],
  "relevant_accounts": ["@2-3", "@real", "@accounts"],
  "hook_ideas": ["2-3 opening hooks that grab attention immediately"],
  "pain_points": ["2-3 real problems this audience faces that this post addresses"],
  "social_proof": ["statistics, quotes, or examples that add credibility"]
}`;

  const researchRaw = await callAI('You are a research assistant.', researchPrompt, 1600);
  let research;
  try {
    research = JSON.parse(researchRaw.replace(/```json|```/g, '').trim());
  } catch {
    research = {
      key_facts: ['Real, specific developments in ' + topic],
      trending_angle: 'A concrete recent development in ' + topic,
      best_hashtags: ['#' + topic.replace(/\s+/g, '')],
      relevant_accounts: [],
      hook_ideas: ['A specific observation about ' + topic],
      pain_points: ['Practical challenge teams face with ' + topic],
      social_proof: ['Verified source citation needed'],
    };
  }

  // ── STEP 2: CONTENT BRIEF ────────────────────────────────────────────────
  const platformRules = {
    linkedin: `Professional, thought-leadership tone. 200-350 words.
Structure: Hook → Insight → Proof → CTA.
Start with a bold statement or question. Use short paragraphs and line breaks.
Include specific numbers. End with a discussion-generating question.
Max 5 hashtags. Format for readability on mobile.`,
    twitter: `Punchy, max 270 chars. One powerful insight. 2-3 hashtags.
Lead with a number or controversial statement.`,
    facebook: `Conversational and story-driven. 150-250 words.
Use storytelling: Situation → Conflict → Resolution → Takeaway.
Emojis welcome. Strong CTA at end.`,
    instagram: `Visual-first caption. 150-200 words.
First 2 lines must hook before "more" cut-off.
Storytelling approach. 20-30 hashtags in first comment or at end.
Use line breaks between sections.`,
  };

  const contentBrief = {
    topic,
    platform,
    postNumber,
    trendingAngle: research.trending_angle,
    keyFacts: research.key_facts?.slice(0, 3),
    hashtags: research.best_hashtags,
    mentions: [],
    targetAudience: research.target_audience,
    contentPillar: 'Educational + Thought Leadership',
    cta: 'What are your thoughts on this? Share below 👇',
    platformRules: platformRules[platform] || platformRules.linkedin,
    hookIdeas: research.hook_ideas,
    painPoints: research.pain_points,
    socialProof: research.social_proof,
    webSources: webData,
  };

  // ── STEP 3: AUTHENTIC CONTENT GENERATION ─────────────────────────────────
  const bannedPatternsBlock = IS_AUTHENTIC ? `BANNED PATTERNS — Your post will be REJECTED if it contains ANY of these:
  ❌ Numbered listicles ("1️⃣ First insight:", "2️⃣ Key takeaway:")
  ❌ Unsourced statistics ("78% of enterprises...", "$2.3 trillion market...")
  ❌ Generic hook openers ("Here's what happened this week that blew my mind")
  ❌ Engagement-bait CTAs ("Drop your thoughts below 👇 Let's have a real conversation")
  ❌ Emoji bullet markers (📊 📈 as list markers)
  ❌ Vague filler ("the numbers speak for themselves", "here's what most people miss")
  ❌ Corporate-guru framing ("I've been saying this for years", "nobody is talking about this")` : '';

  const voiceInstructions = IS_AUTHENTIC
    ? `VOICE & STYLE:
- Write in first person about something specific you (the writer) have done, built, or learned
- Use concrete details: real project names, real numbers from the research data, real trade-offs
- Never fabricate data — if no specific number is available, describe the trend qualitatively
- Sound like a knowledgeable peer at a meetup, not a LinkedIn guru
- Every sentence should pass the "would someone actually say this in conversation?" test
- The hook should be a genuine observation, not a manufactured "bold statement"
- CTA should be a natural question someone would actually ask, not "share your thoughts below"`
    : `VOICE & STYLE:
- Professional, polished corporate tone
- Sound like an industry expert sharing analysis
- Use data points where available`;

  const postPrompt = `Write a ${platform} social post #${postNumber} about ${topic}.

TOPIC: ${topic}
TRENDING ANGLE: ${research.trending_angle}
KEY FACTS: ${research.key_facts?.slice(0, 3).join(' | ')}
HOOK IDEAS: ${research.hook_ideas?.join(' | ')}
PAIN POINTS: ${research.pain_points?.join(' | ')}
HASHTAGS: ${research.best_hashtags?.join(' ')}

WEB RESEARCH DATA:
${webData.substring(0, 1000)}

STRICT PLATFORM RULES (MUST FOLLOW ALL):
${getStrictPlatformRules(platform)}

${bannedPatternsBlock}

${voiceInstructions}

CONTENT REQUIREMENTS (ALL MANDATORY — a post missing any of these is rejected):
- 1. HOOK LINE: the FIRST line must be a hook that is directly and specifically about
  "${topic}" — reference the actual subject, a concrete detail from it, or the trending
  angle. It must NOT be a generic, reusable opener (no "Here's what blew my mind", no
  "Let's talk about…", no "In today's fast-paced world"). The hook contains NO emojis.
- 2. RESEARCH PARAGRAPH: one short paragraph after the hook that MUST:
     • include exactly ONE concrete, specific data point (a number, date, version, named
       tool, or real example) drawn from the WEB RESEARCH DATA above — never invent one; if
       the research has no usable specific, state a concrete qualitative fact instead.
     • contain EXACTLY 2 emojis, BOTH placed inside this paragraph (never in the hook, the
       bullets, or the hashtags). Use relevant, meaningful emojis — do NOT use 📊 📈 📉 ✅
       ❌ 💪 🌟 as markers.
- 3. KEY TAKEAWAYS (bullet points — MANDATORY): after the paragraph, add 3-4 bullet points
  of the most important, concrete takeaways about "${topic}". Each bullet is on its own line,
  starts with "- ", is specific to the actual subject (not filler advice), and contains NO
  emojis.
- Address a real pain point the audience actually faces.
- Sound human, not corporate — NO fluff, NO generic AI-sounding phrasing, NO throwaway advice.
- Do NOT @-mention or tag any person, company, or handle. Mentions are only allowed when a
  specific handle is explicitly provided; none is provided here, so tag no one.
- MUST end with ${getPlatformHashtagCount(platform)} hashtags STRICTLY tied to "${topic}" and
  its real subject matter (e.g. #RetrievalAugmentedGeneration, not #Tech / #AI / #Innovation).
  Ban generic one-word filler tags and any tag not clearly about the topic. No forbidden
  words: buy now, click here, limited time, act fast, 100% free.
- Line breaks between the hook, the paragraph, the bullet block, and the hashtags.

Return ONLY the post text. No explanations, no intro, no markdown formatting.`;

  const systemMsg = IS_AUTHENTIC
    ? `You write social media posts that sound like a real person who actually built or shipped something. You avoid all generic corporate-LinkedIn-guru language. You use specific details, first-person experience, and genuine observations. Every stat you cite must come from the provided research data — never fabricate numbers. You ALWAYS open with a topic-specific hook, ALWAYS include a "key takeaways" bullet list of 3-4 concrete points, and place EXACTLY 2 emojis in the body paragraph only.`
    : `You are a professional marketing content creator for ${platform}. Your posts are polished, data-driven, and industry-relevant.`;

  let postContent = await callAI(systemMsg, postPrompt, 1400);
  let retried = false;

  if (IS_AUTHENTIC && containsBannedPatterns(postContent)) {
    console.warn(`[PostGen] Banned patterns detected in post #${postNumber} for ${platform}. Retrying with stronger instruction.`);
    const retryPrompt = postPrompt + `\n\nCRITICAL: Your previous draft was rejected for violating banned patterns. Write this again from scratch. Avoid ALL generic marketing language. Be specific. Be real. No stats unless they came from the web research above. No numbered lists. No emoji bullet points. No "drop your thoughts" CTAs. Write like a real human.`;
    postContent = await callAI(systemMsg, retryPrompt, 1400);
    retried = true;
  }

  // ── IMAGE PROMPT ─────────────────────────────────────────────────────────
  const visualHook = research.hook_ideas?.[0] || research.trending_angle || topic;
  const imagePrompt = `Professional marketing visual for: "${topic}"

Core message: "${visualHook}"
Key data/stats to visually emphasize: "${(research.key_stats || research.statistics || []).slice(0,3).join(", ") || "N/A"}"

Requirements:
- Modern, premium, brand-worthy design
- Tech/business editorial style (like Forbes, TechCrunch, HBR covers)
- Dark background with vibrant accent colors (deep blue + orange/gold or purple + cyan)
- Clean typography overlay with the key hook message
- Abstract tech/graph/data visualization elements
- NO human faces
- NO text that says "AI generated"
- 1080x1350 vertical format (LinkedIn/Instagram feed)
- Resolution: sharp, production quality

Style keywords: modern, premium, editorial, tech, data visualization, dark mode, professional, minimalist`;

  return {
    topic,
    platform,
    content: postContent.trim(),
    hashtags: research.best_hashtags || [],
    mentions: [],
    imagePrompt,
    research,
    postNumber,
    contentBrief,
    workflowStep: 'content_generated',
    webResearchUsed: webData.substring(0, 300),
    sources: webResearch.sources.map(s => ({ title: s.title, url: s.url, verified: !!s.verified })),
    verifiedSourceCount: verifiedSources.length,
    postToneMode: POST_TONE_MODE,
    bannedPatternCheck: IS_AUTHENTIC ? (containsBannedPatterns(postContent) ? 'FAILED_RETRY' : 'PASSED') : 'DISABLED',
    retried,
  };
}

// NOTE: Twitter intentionally excluded from the active default set (kept in code/config
// as `disabled` so it can be re-enabled later). See routes/posts.js STRICT_RULES + UI toggle.
export async function generateDailyPosts(topicInput, platforms = ['linkedin', 'facebook']) {
  const topic = topicInput || DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];
  const posts = [];

  console.log(`[PostGen] Starting unified workflow for topic: "${topic}"`);
  console.log(`[PostGen] Target platforms: ${platforms.join(', ')}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-workflow-'));
  console.log(`[PostGen] Temp directory: ${tempDir}`);

  try {
    // ONE unified generation — one research pass + one core narrative adapted per platform
    const unified = await generateUnifiedPosts(topic, platforms);
    const research = unified.research;

    console.log(`[PostGen] Unified: ${unified.verifiedSourceCount} verified sources, ` +
      `core narrative + ${Object.keys(unified.posts).length} platform adaptations`);

    console.log(`[PostGen] Generating & validating images for all platforms...`);
    const imageResults = await generateAllPlatformImages(topic, research, platforms, tempDir, (research.hook_ideas || [])[0] || topic, unified.core);

    console.log(`[PostGen] Assembling final scheduled posts...`);

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      const platformPost = unified.posts[platform];
      if (!platformPost) continue;

      const time = POST_TIMES[i % POST_TIMES.length];
      const imageResult = imageResults[platform];
      let imageUrl = null;
      let resizedImages = {};

      if (imageResult && !imageResult.error) {
        imageUrl = imageResult.originalUrl;
        resizedImages = imageResult.resizedImages || {};
        console.log(`[PostGen] ${platform}: Model=${imageResult.modelUsed}, Validation=${imageResult.validation?.success ? 'PASS' : 'FAIL'}, Variants=${Object.keys(resizedImages).length}`);
      } else {
        console.warn(`[PostGen] ${platform}: Image generation failed, using fallback`);
        try {
          imageUrl = await generatePostImage(topic, 'professional', '4:5', platformPost.content || '');
        } catch (e) {
          imageUrl = null;
        }
      }

      const scheduledTime = new Date();
      scheduledTime.setHours(parseInt(time.time.split(':')[0]), 0, 0, 0);
      if (scheduledTime < new Date()) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
      }

      posts.push({
        topic,
        platform,
        content: platformPost.content,
        hashtags: platformPost.hashtags || [],
        mentions: platformPost.mentions || unified.mentions || [],
        imagePrompt: (research.hook_ideas || [])[0] || topic,
        research,
        postNumber: i + 1,
        contentBrief: { topic, platform, keyFacts: research.key_facts, trendingAngle: research.trending_angle },
        workflow: {
          step1_research: true,
          step2_brief: true,
          step3_content: true,
          step4_image_validation: imageResult?.validation?.success || false,
          step5_assembly: true,
          modelUsed: imageResult?.modelUsed || 'pollinations',
          contentType: imageResult?.contentType || 'text-heavy',
        },
        imageUrl,
        resizedImages,
        scheduledFor: scheduledTime.toISOString(),
        timeLabel: time.label,
        status: 'scheduled',
      });
    }

    console.log(`[PostGen] Workflow complete: ${posts.length} posts generated from one unified narrative`);
  } catch (err) {
    console.error('[PostGen] Workflow error:', err);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('[PostGen] Failed to cleanup temp dir:', e.message);
    }
  }

  return { topic, posts };
}

// ─── UNIFIED GENERATION ──────────────────────────────────────────────────
// ONE research pass + ONE core narrative, adapted per platform. This replaces
// the old approach of an independent AI generation per platform (which produced
// inconsistent, repetitive output). Mentions are woven naturally into the body
// as plain text — never dumped as a trailing @name list.

// A small, curated set of people/handles whose names may be woven into posts
// when contextually relevant. Overridable via UNIFIED_MENTIONS env (comma-sep).
const DEFAULT_MENTION_POOL = [
  'Ameen Alam', 'Zia Khan', 'Asharib Ali', 'Panaversity',
];

function getMentionPool() {
  const raw = (process.env.UNIFIED_MENTIONS || '').trim();
  if (!raw) return DEFAULT_MENTION_POOL;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// Platform adaptation rules for reshaping the SAME core narrative.
/**
 * Generate ONE research-grounded core post, then adapt it to each platform.
 * Returns { topic, research, core, posts: { [platform]: { content, hashtags, mentions } } }
 * @param {string} topicInput  Topic; falls back to a random default topic.
 * @param {string[]} platforms Platforms to adapt for.
 * @param {object} opts        { mentions?: string[] } — explicit mention pool override.
 */
export async function generateUnifiedPosts(topicInput, platforms = ['linkedin', 'facebook'], opts = {}) {
  const topic = topicInput || DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];
  const mentionPool = (opts.mentions && opts.mentions.length) ? opts.mentions : getMentionPool();

  // ── STEP 1: ONE web research pass (shared across all platforms) ──────────
  console.log(`[Unified] Web researching once for topic: "${topic}"`);
  const webResearch = await condensedWebSearch(topic);
  const webData = webResearch.text;
  const verifiedSources = webResearch.sources.filter(s => s.verified);

  const researchPrompt = `You are a MARKETING research analyst. Below are real web search results for "${topic}".

WEB SEARCH RESULTS:
${webData}

Return ONLY a valid JSON object with these keys. Do NOT include any thinking, reasoning, markdown, or code fences — just raw JSON beginning with { and ending with }:

{
  "key_facts": ["4-5 specific, factual, engaging facts drawn from the web results above — each fact must include a specific name, number, date, or concrete detail"],
  "trending_angle": "The most compelling, shareable angle right now",
  "target_audience": "Exactly who should read this",
  "best_hashtags": ["#5-7", "#relevant", "#specific"],
  "hook_ideas": ["2-3 opening hooks"],
  "pain_points": ["2-3 real problems this audience faces"],
  "social_proof": ["stats/quotes/examples that add credibility"]
}`;

  _resetMockFlag();
  const researchRaw = await callAI('You are a research assistant.', researchPrompt, 1600);
  if (_lastCallUsedMock) console.error('[Unified] ⚠ RESEARCH mock fallback detected — research may be generic.');
  let research;
  try {
    research = JSON.parse(researchRaw.replace(/```json|```/g, '').trim());
  } catch {
    research = {
      key_facts: [`Real, specific developments in ${topic}`],
      trending_angle: `A concrete recent development in ${topic}`,
      target_audience: 'Builders and technical decision-makers',
      best_hashtags: [`#${topic.replace(/\s+/g, '')}`],
      hook_ideas: [`A specific observation about ${topic}`],
      pain_points: [`Practical challenge teams face with ${topic}`],
      social_proof: ['Verified source citation needed'],
    };
    // Try to extract concrete facts from whatever the AI returned (even non-JSON)
    const rawLower = (researchRaw || '').toLowerCase();
    const webSources = webResearch.sources || [];
    const concreteTerms = [];
    for (const src of webSources.slice(0, 5)) {
      const words = (src.title || '').split(/\s+/).filter(w => w.length > 3);
      concreteTerms.push(...words);
    }
    if (concreteTerms.length >= 2) {
      research.key_facts = concreteTerms.slice(0, 5)
        .map(t => `${t} is referenced in sources about ${topic}`);
    }
    console.warn('[Unified] Research JSON parse failed, extracted', concreteTerms.length, 'concrete terms from web sources as fallback.');
  }

  // ── STEP 2: ONE core narrative (platform-neutral, the single source of truth) ──
  const mentionGuidance = mentionPool.length
    ? `You MAY naturally reference at most ONE of these people/orgs IF it genuinely fits
the point (e.g. crediting an idea, tagging a collaborator). Weave the name into a real
sentence — never a trailing list. If none fit naturally, mention no one.
Candidates: ${mentionPool.join(', ')}.`
    : `Do not @-mention or tag anyone; no handles are provided.`;

  const hashtagPool = (research.best_hashtags || []).slice(0, 7).join(' ') || `#${topic.replace(/\s+/g, '')}`;
  const corePrompt = `Write ONE final, ready-to-publish social media caption about "${topic}".
This SINGLE caption will be posted VERBATIM to LinkedIn, Facebook, and Instagram — the
exact same text on all three platforms. Do NOT write platform variations. Write one caption
that reads naturally on every platform.

TOPIC: ${topic}
TRENDING ANGLE: ${research.trending_angle}
KEY FACTS: ${(research.key_facts || []).slice(0, 4).join(' | ')}
HOOK IDEAS: ${(research.hook_ideas || []).join(' | ')}
PAIN POINTS: ${(research.pain_points || []).join(' | ')}
SUGGESTED HASHTAGS: ${hashtagPool}

WEB RESEARCH DATA:
${webData.substring(0, 1000)}

EXACT STRUCTURE (follow precisely):
1. HOOK LINE — one sentence specific to "${topic}", starting with exactly ONE relevant emoji
   (e.g. 🚀 💡 🔑 📌 🔥). No generic openers.
2. Blank line.
3. 2-3 KEY POINTS — each on its own line, each beginning with ONE small emoji bullet
   (e.g. ✅ 📌 💡 🔑), each specific and concrete, drawn from the research above.
4. Blank line.
5. CLOSING QUESTION / CTA — one line ending in a question, with exactly ONE emoji.
6. Blank line.
7. HASHTAGS — 5-7 hashtags on the final line, tied to "${topic}". No emojis on this line.

EMOJI BUDGET: 3-6 emojis TOTAL across the whole caption (1 in hook + 2-3 on bullets +
1 in CTA). Professional but engaging — never spammy. The hashtag line has NO emojis.

CONTENT RULES:
- Sound like a real practitioner, first person, no corporate-guru fluff.
- At most ONE concrete data point, and only if it appears in the research (never invented).
- ${mentionGuidance}
- Every point must trace to something concrete from the research. No vague reflections.

Return ONLY the final caption text, formatted exactly as structured above.`;

  const coreSystem = `You write authentic, research-grounded social posts that sound like a real person who shipped something. You return ONLY the post body — no reasoning, no planning, no meta-commentary. Start immediately with the hook sentence.`;

  _resetMockFlag();
  let core = await callAI(coreSystem, corePrompt, 1400);
  if (_lastCallUsedMock) console.error('[Unified] ⚠ CORE: AI provider fell back to mock — core narrative may be generic.');
  // Strip any AI reasoning from core
  core = core.trim();
  const coreLines = core.split('\n');
  const coreStart = coreLines.findIndex(l => {
    const t = l.trim().replace(/^["']/, '');
    return t.length > 15 && /^[A-Z]/.test(t) && !/we need|let me|i need|first,|okay,|the user|here are|below is|the core/i.test(t);
  });
  if (coreStart > 0 && coreStart < coreLines.length / 2) {
    core = coreLines.slice(coreStart).join('\n').trim();
    console.log(`[Unified] Stripped reasoning from core (${coreStart} lines)`);
  }
  if (IS_AUTHENTIC && containsBannedPatterns(core)) {
    console.warn('[Unified] Banned patterns in core narrative — regenerating once.');
    _resetMockFlag();
    core = await callAI(coreSystem, corePrompt + '\n\nCRITICAL: previous draft was rejected for generic/banned patterns. Rewrite from scratch, be specific and real.', 1400);
    if (_lastCallUsedMock) console.error('[Unified] ⚠ CORE retry also fell back to mock.');
  }
  core = core.trim();

  // Detect which mentions actually ended up woven into the core text.
  const usedMentions = mentionPool.filter(m => core.toLowerCase().includes(m.toLowerCase()));

  // ── STEP 3: SINGLE UNIFIED CAPTION — same text on every platform ─────────
  // We no longer regenerate/reshape per platform. The core caption is already
  // the final, ready-to-publish text (hook + emoji bullets + CTA + hashtags),
  // and the SAME caption is posted verbatim to LinkedIn, Facebook, and
  // Instagram. This guarantees one consistent message everywhere.
  const inContentTags = core.match(/#[\p{L}\p{N}_]+/gu) || [];
  const hashtags = inContentTags.length ? [...new Set(inContentTags)] : (research.best_hashtags || []);
  const bannedCheck = IS_AUTHENTIC ? (containsBannedPatterns(core) ? 'FAILED_RETRY' : 'PASSED') : 'DISABLED';

  const posts = {};
  for (const platform of platforms) {
    posts[platform] = {
      platform,
      content: core,          // identical caption for every platform
      hashtags,
      mentions: usedMentions,
      bannedPatternCheck: bannedCheck,
    };
  }

  return {
    topic,
    research,
    core,
    mentions: usedMentions,
    mockFallback: _lastCallUsedMock,
    posts,
    sources: webResearch.sources.map(s => ({ title: s.title, url: s.url, verified: !!s.verified })),
    verifiedSourceCount: verifiedSources.length,
    postToneMode: POST_TONE_MODE,
  };
}

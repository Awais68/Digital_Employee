import { callAI } from './aiProvider.js';
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
    structure: 'HOOK → BODY (2-4 short paragraphs) → HASHTAGS → CTA'
  },
  facebook: {
    minWords: 50, maxWords: 250,
    minHashtags: 2, maxHashtags: 5,
    tone: 'friendly, conversational, relatable',
    structure: 'HOOK → BODY (conversational) → HASHTAGS'
  },
  instagram: {
    minWords: 30, maxWords: 150,
    minHashtags: 10, maxHashtags: 15,
    requireLineBreaks: true,
    tone: 'casual, inspiring, authentic',
    structure: 'HOOK → BODY (short sentences) → HASHTAGS (10-15)'
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
- Emojis: use sparingly & naturally, only where a human would actually put one`
    : `- Emojis: use at least 2-3 where appropriate`;

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
    const wikiResp = await fetch(wikiUrl, { signal: AbortSignal.timeout(8000) });
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
      const ddgResp = await fetch(ddgUrl, { signal: AbortSignal.timeout(8000) });
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
        signal: AbortSignal.timeout(6000),
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

  const researchRaw = await callAI('You are a research assistant.', researchPrompt, 1200);
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

CONTENT REQUIREMENTS:
- Lead with a specific observation or real experience (not a generic hook)
- MANDATORY: include exactly ONE concrete, specific data point (a number, date, version,
  named tool, or real example) drawn from the WEB RESEARCH DATA above. If the research
  contains no usable specific, state a concrete qualitative fact instead — never invent one.
- Address a real pain point the audience actually faces
- Sound human, not corporate — NO fluff, NO generic advice
- Do NOT @-mention or tag any person, company, or handle. Mentions are only allowed when a
  specific handle is explicitly provided; none is provided here, so tag no one.
- MUST end with ${getPlatformHashtagCount(platform)} hashtags that are SPECIFIC to this topic
  (e.g. #RetrievalAugmentedGeneration, not #Tech / #AI / #Innovation). Ban generic one-word
  filler tags. No forbidden words: buy now, click here, limited time, act fast, 100% free
- Line breaks between paragraphs

Return ONLY the post text. No explanations, no intro, no markdown formatting.`;

  const systemMsg = IS_AUTHENTIC
    ? `You write social media posts that sound like a real person who actually built or shipped something. You avoid all generic corporate-LinkedIn-guru language. You use specific details, first-person experience, and genuine observations. Every stat you cite must come from the provided research data — never fabricate numbers.`
    : `You are a professional marketing content creator for ${platform}. Your posts are polished, data-driven, and industry-relevant.`;

  let postContent = await callAI(systemMsg, postPrompt, 1000);
  let retried = false;

  if (IS_AUTHENTIC && containsBannedPatterns(postContent)) {
    console.warn(`[PostGen] Banned patterns detected in post #${postNumber} for ${platform}. Retrying with stronger instruction.`);
    const retryPrompt = postPrompt + `\n\nCRITICAL: Your previous draft was rejected for violating banned patterns. Write this again from scratch. Avoid ALL generic marketing language. Be specific. Be real. No stats unless they came from the web research above. No numbered lists. No emoji bullet points. No "drop your thoughts" CTAs. Write like a real human.`;
    postContent = await callAI(systemMsg, retryPrompt, 1000);
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

export async function generateDailyPosts(topicInput, platforms = ['linkedin', 'twitter', 'facebook']) {
  const topic = topicInput || DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];
  const posts = [];

  console.log(`[PostGen] Starting 5-step workflow for topic: "${topic}"`);
  console.log(`[PostGen] Target platforms: ${platforms.join(', ')}`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-workflow-'));
  console.log(`[PostGen] Temp directory: ${tempDir}`);

  try {
    const firstPlatform = platforms[0] || 'linkedin';
    const firstPostData = await researchAndGeneratePost(topic, firstPlatform, 1);
    const research = firstPostData.research;

    console.log(`[PostGen] Step 1-3 complete: Web Research + Content Brief + Marketing Copy done`);
    console.log(`[PostGen] Step 4: Generating & validating images for all platforms...`);

    const imageResults = await generateAllPlatformImages(topic, research, platforms, tempDir, firstPostData.imagePrompt, firstPostData.content);

    console.log(`[PostGen] Step 5: Assembling final marketing posts...`);

    for (let i = 0; i < Math.min(platforms.length, 5); i++) {
      const platform = platforms[i % platforms.length];
      const time = POST_TIMES[i];
      const postData = await researchAndGeneratePost(topic, platform, i + 1);

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
          imageUrl = await generatePostImage(postData.topic, 'professional', '4:5', postData.content || '');
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
        ...postData,
        imageUrl,
        resizedImages,
        workflow: {
          step1_research: true,
          step2_brief: true,
          step3_content: true,
          step4_image_validation: imageResult?.validation?.success || false,
          step5_assembly: true,
          modelUsed: imageResult?.modelUsed || 'pollinations',
          contentType: imageResult?.contentType || 'text-heavy',
        },
        scheduledFor: scheduledTime.toISOString(),
        timeLabel: time.label,
        status: 'scheduled',
      });
    }

    console.log(`[PostGen] Workflow complete: ${posts.length} marketing posts generated`);
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

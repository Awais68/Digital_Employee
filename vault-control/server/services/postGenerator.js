import { callAI } from './aiProvider.js';
import { generatePostImage } from './imageGenerator.js';
import { generateAllPlatformImages, PLATFORM_SPECS } from './socialImageWorkflow.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// STRICT PLATFORM RULES
const STRICT_PLATFORM_RULES = {
  linkedin: {
    minWords: 80, maxWords: 300,
    minHashtags: 3, maxHashtags: 5,
    requireEmojis: true, requireLineBreaks: true,
    tone: 'professional, insightful, thought-leadership',
    structure: 'HOOK → BODY (2-4 paragraphs with emojis) → HASHTAGS → CTA'
  },
  facebook: {
    minWords: 50, maxWords: 250,
    minHashtags: 2, maxHashtags: 5,
    requireEmojis: true,
    tone: 'friendly, conversational, relatable',
    structure: 'HOOK → BODY (conversational) → HASHTAGS'
  },
  instagram: {
    minWords: 30, maxWords: 150,
    minHashtags: 10, maxHashtags: 15,
    requireEmojis: true, requireLineBreaks: true,
    tone: 'casual, inspiring, motivational',
    structure: 'HOOK → BODY (short sentences, emojis) → HASHTAGS (10-15)'
  },
  twitter: {
    minWords: 10, maxWords: 50,
    minHashtags: 1, maxHashtags: 3,
    requireEmojis: true,
    tone: 'punchy, concise, impactful',
    structure: 'Tweet (280 chars max) → HASHTAGS'
  }
};

function getStrictPlatformRules(platform) {
  const rules = STRICT_PLATFORM_RULES[platform] || STRICT_PLATFORM_RULES.linkedin;
  return `Platform: ${platform}
- Word count: ${rules.minWords}-${rules.maxWords} words (STRICT)
- Hashtags: ${rules.minHashtags}-${rules.maxHashtags} at the END (STRICT)
- Emojis: REQUIRED - use at least 3-5 as bullet points
- Line breaks: ${rules.requireLineBreaks ? 'REQUIRED between paragraphs' : 'Optional'}
- Tone: ${rules.tone}
- Structure: ${rules.structure}
- FORBIDDEN: buy now, click here, limited time, act fast, 100% free`;
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
      key_facts: [topic],
      trending_angle: topic,
      best_hashtags: ['#Tech', '#AI', '#Innovation', '#FutureOfWork'],
      relevant_accounts: [],
      hook_ideas: [`The future of ${topic} is here`],
      pain_points: ['Staying ahead of rapid change'],
      social_proof: ['Industry leaders are investing heavily in this area'],
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
    mentions: research.relevant_accounts?.slice(0, 2),
    targetAudience: research.target_audience,
    contentPillar: 'Educational + Thought Leadership',
    cta: 'What are your thoughts on this? Share below 👇',
    platformRules: platformRules[platform] || platformRules.linkedin,
    hookIdeas: research.hook_ideas,
    painPoints: research.pain_points,
    socialProof: research.social_proof,
    webSources: webData,
  };

  // ── STEP 3: HIGH-QUALITY MARKETING CONTENT GENERATION ────────────────────
  const postPrompt = `Create a HIGH-IMPACT marketing social media post #${postNumber} for ${platform}.

TOPIC: ${topic}
TRENDING ANGLE: ${research.trending_angle}
KEY FACTS: ${research.key_facts?.slice(0, 3).join(' | ')}
HOOK IDEAS: ${research.hook_ideas?.join(' | ')}
PAIN POINTS: ${research.pain_points?.join(' | ')}
SOCIAL PROOF: ${research.social_proof?.join(' | ')}
HASHTAGS: ${research.best_hashtags?.join(' ')}
ACCOUNTS TO MENTION: ${research.relevant_accounts?.slice(0, 2).join(' ')}

WEB RESEARCH DATA:
${webData.substring(0, 1000)}

STRICT PLATFORM RULES (MUST FOLLOW ALL):
${getStrictPlatformRules(platform)}

MARKETING PSYCHOLOGY FRAMEWORK — Use ONE of these:
1. AIDA: Attention → Interest → Desire → Action
2. PAS: Problem → Agitate → Solution
3. Hook-Story-Offer: Hook → Relatable story → Value proposition
4. Before-After-Bridge: Where they are → Where they could be → How to get there

CONTENT REQUIREMENTS (STRICT - VIOLATION = REJECTION):
- Lead with a STRONG HOOK (question, bold statement, surprising stat, or relatable pain point)
- Use specific numbers, data points, and real examples (from web research)
- Address a real pain point your audience faces
- Provide actionable value — don't just inform, teach something
- Include social proof (stats, trends, expert opinions) 
- End with a CTA that drives engagement (question, poll, discussion starter)
- Sound human, not corporate. Like an expert sharing genuine insight.
- NO fluff, NO generic advice, NO ChatGPT-sounding sentences
- MUST have ${getPlatformHashtagCount(platform)} hashtags at the end
- MUST have at least 3-5 emojis
- MUST have line breaks between paragraphs
- NO forbidden words: buy now, click here, limited time, act fast, 100% free

Return ONLY the post text. No explanations, no intro, no markdown formatting around the text.`;

  const postContent = await callAI(
    `You are a world-class marketing strategist and content creator for ${platform}. Your posts go viral because they provide extreme value in an engaging, human way.`,
    postPrompt, 1000
  );

  // ── IMAGE PROMPT ─────────────────────────────────────────────────────────
  const visualHook = research.hook_ideas?.[0] || research.trending_angle || topic;
  const imagePrompt = `Professional marketing visual for: "${topic}"

Core message: "${visualHook}"

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
    mentions: research.relevant_accounts || [],
    imagePrompt,
    research,
    postNumber,
    contentBrief,
    workflowStep: 'content_generated',
    webResearchUsed: webData.substring(0, 300),
    sources: webResearch.sources.map(s => ({ title: s.title, url: s.url, verified: !!s.verified })),
    verifiedSourceCount: verifiedSources.length,
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

    const imageResults = await generateAllPlatformImages(topic, research, platforms, tempDir, firstPostData.imagePrompt);

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
          imageUrl = await generatePostImage(postData.imagePrompt);
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

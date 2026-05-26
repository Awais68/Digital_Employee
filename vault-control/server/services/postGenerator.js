import { callAI } from './aiProvider.js';
import { generatePostImage } from './imageGenerator.js';

export const DEFAULT_TOPICS = [
  'Software Engineering best practices',
  'Web Development trends',
  'Agentic AI and Automation',
  'Large Language Models (LLMs)',
  'Latest Tech News',
];

const POST_TIMES = [
  { label: 'Morning',   time: '09:00', cron: '0 9 * * *' },
  { label: 'Afternoon', time: '14:00', cron: '0 14 * * *' },
  { label: 'Evening',   time: '20:00', cron: '0 20 * * *' },
];

export async function researchAndGeneratePost(topic, platform, postNumber = 1) {
  const researchPrompt = `You are a social media content expert.
Research and identify the 5 most engaging, current, and relevant facts about:
"${topic}"

Focus on:
- Latest developments (2024-2025)
- Practical insights professionals care about
- Surprising or counterintuitive facts
- Statistics and numbers when possible

Return ONLY JSON:
{
  "key_facts": ["fact1", "fact2", "fact3", "fact4", "fact5"],
  "trending_angle": "the most viral angle for this topic right now",
  "target_audience": "who this is for",
  "best_hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "relevant_accounts": ["@account1", "@account2", "@account3"]
}`;

  const researchRaw = await callAI('You are a research assistant.', researchPrompt, 800);
  let research;
  try {
    research = JSON.parse(researchRaw.replace(/```json|```/g, '').trim());
  } catch {
    research = { key_facts: [topic], trending_angle: topic,
                 best_hashtags: ['#Tech', '#AI'], relevant_accounts: [] };
  }

  const platformRules = {
    linkedin: 'Professional tone. 150-300 words. Start with a hook. Use line breaks. End with question or CTA. Max 5 hashtags.',
    twitter:  'Punchy, max 270 chars. One key insight. 2-3 hashtags. Use numbers.',
    facebook: 'Conversational, 100-200 words. Emojis welcome. CTA at end.',
    instagram:'Visual-first caption. 150-200 words. 20-30 hashtags at end.',
  };

  const postPrompt = `Create social media post #${postNumber} for ${platform}.
Topic: ${topic}
Trending angle: ${research.trending_angle}
Key facts to use: ${research.key_facts.slice(0, 3).join(' | ')}
Hashtags to include: ${research.best_hashtags.join(' ')}
Relevant accounts to mention: ${research.relevant_accounts.slice(0, 2).join(' ')}

Platform rules: ${platformRules[platform] || platformRules.linkedin}

Make it feel human and authentic, not AI-generated.
Use specific numbers, actionable tips, and genuine insight.
Include relevant # and @ for maximum audience engagement.

Return ONLY the post text. No explanations, no quotes around it.`;

  const postContent = await callAI(
    `You are a viral social media content creator for ${platform}.`,
    postPrompt, 600
  );

  const imagePrompt = `Professional social media image for: "${topic}"
Style: Modern, tech-focused, clean design
Text overlay: Key insight from the post
Color scheme: Dark background with accent colors
No faces, no text that says AI-generated`;

  return {
    topic,
    platform,
    content: postContent.trim(),
    hashtags: research.best_hashtags,
    mentions: research.relevant_accounts,
    imagePrompt,
    research,
    postNumber,
  };
}

export async function generateDailyPosts(topicInput, platforms = ['linkedin', 'twitter', 'facebook']) {
  const topic = topicInput || DEFAULT_TOPICS[Math.floor(Math.random() * DEFAULT_TOPICS.length)];
  const posts = [];

  for (let i = 0; i < Math.min(platforms.length, 3); i++) {
    const platform = platforms[i % platforms.length];
    const time = POST_TIMES[i];
    const postData = await researchAndGeneratePost(topic, platform, i + 1);

    let imageUrl = null;
    try {
      imageUrl = await generatePostImage(postData.imagePrompt);
      console.log('[PostGen] Image URL:', imageUrl?.substring(0, 80));
    } catch (e) {
      console.warn('[PostGen] Image generation failed:', e.message);
      imageUrl = null;
    }

    const scheduledTime = new Date();
    scheduledTime.setHours(parseInt(time.time.split(':')[0]), 0, 0, 0);
    if (scheduledTime < new Date()) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    posts.push({
      ...postData,
      imageUrl,
      scheduledFor: scheduledTime.toISOString(),
      timeLabel: time.label,
      status: 'scheduled',
    });
  }

  return { topic, posts };
}

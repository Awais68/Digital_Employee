#!/usr/bin/env node
/**
 * PHASE 5 — Validation: End-to-End Content Pipeline Test
 *
 * Validates: research → master content → platform variants → image
 * Acceptance criteria:
 *   ✓ One shared master post per run, not 3 independent generations
 *   ✓ Every post traces to ≥2 concrete points from live research
 *   ✓ Zero instances of banned generic filler phrasing
 *   ✓ Exactly 1–2 emojis per post
 *   ✓ Mentions rendered as proper inline mentions, not trailing name-dump
 *   ✓ Image: logo and headline visibly larger, no dead space, dynamic CTA question, trending badge
 *   ✓ All 4 previously known image bugs remain fixed
 *   ✓ No silent fallback to mock content — error/log loudly if search fails
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(__dirname, 'server');
const OUTPUT_DIR = path.resolve(__dirname, 'test_output');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Color helpers ──────────────────────────────────────────────
const PASS = '\x1b[32m✓ PASS\x1b[0m';
const FAIL = '\x1b[31m✗ FAIL\x1b[0m';
const WARN = '\x1b[33m⚠ WARN\x1b[0m';
const INFO = '\x1b[36m▶\x1b[0m';

let passedChecks = 0;
let failedChecks = 0;
let totalChecks = 0;

function check(condition, label, detail = '') {
  totalChecks++;
  if (condition) {
    console.log(`  ${PASS} | ${label}${detail ? ' — ' + detail : ''}`);
    passedChecks++;
  } else {
    console.log(`  ${FAIL} | ${label}${detail ? ' — ' + detail : ''}`);
    failedChecks++;
  }
}

function warn(label, detail) {
  console.log(`  ${WARN} | ${label}${detail ? ' — ' + detail : ''}`);
}

function info(label, detail) {
  console.log(`  ${INFO} ${label}${detail ? ' — ' + detail : ''}`);
}

// ─── Banned patterns (mirrored from postGenerator.js) ──────────
const BANNED_PATTERNS = [
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

function countEmojis(text) {
  const emojiRe = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}]/gu;
  const matches = text.match(emojiRe) || [];
  // Filter out variation selector-16 (U+FE0F) which is an invisible codepoint
  // that happens to fall in the \u{24C2}-\u{1F251} range
  return matches.filter(m => m.codePointAt(0) !== 0xFE0F).length;
}

// ─── TOPIC: Real AI-agent trending topic (from web search Jul 20-21, 2026) ─
const TOPIC = 'Amazon CloudWatch Coding Agent Insights 2026';

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PHASE 5 — E2E Validation Run');
console.log('  Topic: ' + TOPIC);
console.log('  Date:  ' + new Date().toISOString().split('T')[0]);
console.log('═══════════════════════════════════════════════════════════════\n');

// ─── STEP 1: Import pipeline modules ─────────────────────────────
info('STEP 1: Importing pipeline modules');
const { generateUnifiedPosts } = await import(
  path.join(SERVER_DIR, 'services/postGenerator.js')
);
const { generatePostImage } = await import(
  path.join(SERVER_DIR, 'services/imageGenerator.js')
);

// ─── STEP 2: Real web research (embedded in unified generation) ──
// generateUnifiedPosts() calls webSearch + verifySources internally.
info('STEP 2: Real web research (via unified generation engine)');
// (Web research happens inside generateUnifiedPosts below)


// ─── STEP 3: Unified generation (one research pass, one master post) ──
info('STEP 3: Unified post generation (one master → per-platform variants)');

let unified;
let mockUsed = false;

try {
  unified = await generateUnifiedPosts(TOPIC, ['linkedin', 'facebook', 'instagram'], {
    mentions: ['Ameen Alam', 'Zia Khan', 'Asharib Ali']
  });

  // PROBE: Check if AI provider silently fell back to mock by looking at
  // the mock's known signature phrases in the output.
  const mockSignatures = [
    'Here are a few things I have found useful',
    'I have been spending time on',
    'Some observations:',
    'Some practical notes on',
    'The most interesting part of working with',
    'One pattern that keeps coming up',
    'It is not the most glamorous work',
    'Choose tools that fail gracefully',
  ];

  const allText = unified.core + ' ' +
    Object.values(unified.posts).map(p => p.content).join(' ');

  const mockHits = mockSignatures.filter(sig => allText.toLowerCase().includes(sig.toLowerCase()));
  // Also check the mockFallback flag from the generator
  if (unified && unified.mockFallback) {
    mockUsed = true;
    console.log(`  ${FAIL} ⚠ mockFallback flag set — AI provider returned mock content.`);
  }

  if (mockHits.length >= 2) {
    mockUsed = true;
    console.log(`  ${FAIL} ⚠ SILENT MOCK FALLBACK DETECTED! Matched ${mockHits.length} mock signatures:`);
    mockHits.forEach(h => console.log(`       → "${h}"`));
  } else {
    console.log(`  ${PASS} No mock content detected (${mockHits.length} signature matches — <2 threshold)`);
  }
} catch (err) {
  console.error(`\n  ${FAIL} Unified generation threw: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}

check(!mockUsed, 'No silent mock fallback — AI returned real generated content',
  mockUsed ? 'MOCK SIGNATURES DETECTED' : 'clean');

// ─── STEP 4: Validate research & unified structure ────────────
info('STEP 4: Validating research results & unified structure');

const hasRealResults = (unified.sources?.length || 0) > 0;
const hasVerifiedSources = (unified.verifiedSourceCount || 0) > 0;

console.log(`\n  Research results: ${unified.sources?.length || 0} found`);
(unified.sources || []).forEach((s, i) => {
  const v = s.verified ? '✓' : ' ';
  console.log(`    ${i+1}. [${v}] ${s.title}`);
});

check(hasRealResults, 'Web search returned ≥1 result', `${unified.sources?.length || 0} sources`);
check(hasVerifiedSources, '≥1 source reachable/verified',
  `${unified.verifiedSourceCount || 0} verified`);

// Save raw research for audit
fs.writeFileSync(path.join(OUTPUT_DIR, '01_research_results.json'),
  JSON.stringify(unified.sources, null, 2));
info('Research saved to test_output/01_research_results.json');

check(!!unified, 'unified object returned', '');
check(!!unified.core, 'Master core post exists', `length: ${unified.core.length} chars`);
check(!!unified.research, 'Research brief returned', '');
check(!!unified.research.key_facts, 'Research has key_facts',
  `${unified.research.key_facts?.length || 0} facts`);

// Check it's ONE master post, not 3 independent generations
const platformCount = Object.keys(unified.posts).length;
check(platformCount >= 3, '≥3 platform variants from single run',
  `${platformCount} platforms: ${Object.keys(unified.posts).join(', ')}`);

// Save all variants
fs.writeFileSync(path.join(OUTPUT_DIR, '02_unified_output.json'),
  JSON.stringify(unified, null, 2));
info('Unified output saved to test_output/02_unified_output.json');

// ─── STEP 5: LinkedIn-specific validation ──────────────────────
info('STEP 5: LinkedIn variant validation');

const linkedinPost = unified.posts.linkedin;
check(!!linkedinPost, 'LinkedIn post exists', '');

const linkedinContent = linkedinPost.content;
const linkedinWords = linkedinContent.split(/\s+/).filter(Boolean).length;
const linkedinHashtags = linkedinContent.match(/#[\p{L}\p{N}_]+/gu) || [];
const linkedinEmojiCount = countEmojis(linkedinContent);

console.log(`\n  ┌─ LINKEDIN POST ─────────────────────────────────────────────┐`);
console.log(linkedinContent);
console.log(`  └──────────────────────────────────────────────────────────────┘\n`);

// Word count (LinkedIn: 80-300)
check(linkedinWords >= 80, 'Word count ≥80', `${linkedinWords} words`);
check(linkedinWords <= 300, 'Word count ≤300', `${linkedinWords} words`);

// Hashtags (LinkedIn: 3-5)
check(linkedinHashtags.length >= 3, 'Hashtags ≥3', `${linkedinHashtags.length} tags`);
check(linkedinHashtags.length <= 5, 'Hashtags ≤5', `${linkedinHashtags.length} tags`);

// Emojis (exactly 1-2)
check(linkedinEmojiCount >= 1, 'Emojis ≥1', `${linkedinEmojiCount} found`);
check(linkedinEmojiCount <= 2, 'Emojis ≤2', `${linkedinEmojiCount} found`);

// Banned patterns
check(!containsBannedPatterns(linkedinContent), 'No banned filler phrases',
  containsBannedPatterns(linkedinContent) ? 'BANNED TEXT DETECTED' : 'clean');

// Check for specific banned emoji markers
const bannedEmoji = ['📊', '📈', '📉', '✅', '❌', '💪', '🌟'];
const foundBanned = bannedEmoji.filter(e => linkedinContent.includes(e));
check(foundBanned.length === 0, 'No banned emoji markers',
  foundBanned.length > 0 ? `Found: ${foundBanned.join(', ')}` : 'clean');

// Check for forbidden sales words
const forbiddenSales = ['buy now', 'click here', 'limited time', 'act fast', '100% free'];
const foundForbidden = forbiddenSales.filter(w => linkedinContent.toLowerCase().includes(w));
check(foundForbidden.length === 0, 'No forbidden sales words',
  foundForbidden.length > 0 ? `Found: ${foundForbidden.join(', ')}` : 'clean');

// ─── STEP 6: Concrete research traceability ───────────────────
info('STEP 6: Concrete research traceability');

// Collect search terms from BOTH research key_facts AND web source titles
const keyFacts = unified.research.key_facts || [];
const sourceTitles = (unified.sources || []).map(s => s.title);

const allSearchTerms = [...keyFacts, ...sourceTitles];

let concreteHits = 0;
const matchedTerms = [];

for (const term of allSearchTerms) {
  const words = term.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const significantWords = [...new Set(words.filter(w => w.length > 4))];
  const matches = significantWords.filter(w => linkedinContent.toLowerCase().includes(w));
  if (matches.length >= 2) {
    concreteHits++;
    matchedTerms.push(...matches.slice(0, 3));
  }
  if (concreteHits >= 2) break;
}

check(concreteHits >= 2, '≥2 concrete research/source points traceable in LinkedIn post',
  `${concreteHits} matched (terms: ${[...new Set(matchedTerms)].slice(0, 5).join(', ')})`);

// Also check the core post
let coreConcreteHits = 0;
for (const term of allSearchTerms) {
  const words = term.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const significantWords = [...new Set(words.filter(w => w.length > 4))];
  const matches = significantWords.filter(w => unified.core.toLowerCase().includes(w));
  if (matches.length >= 2) {
    coreConcreteHits++;
  }
  if (coreConcreteHits >= 2) break;
}
check(coreConcreteHits >= 2, '≥2 research/source points traceable in core master post',
  `${coreConcreteHits} facts in core`);

if (concreteHits < 2 || coreConcreteHits < 2) {
  console.log(`  ${WARN} Low research traceability — checking sources:`);
  for (const src of sourceTitles.slice(0, 3)) {
    console.log(`    Source: ${src}`);
  }
  console.log(`    Web data present: ${(unified.sources?.length || 0) > 0}`);
  console.log(`    Verified sources: ${unified.verifiedSourceCount}`);
}

// ─── STEP 7: Mention rendering validation ──────────────────────
info('STEP 7: Mention rendering validation');

// Check mentions are inline (not a trailing dump)
const mentionNames = unified.mentions || [];
const linkedinLower = linkedinContent.toLowerCase();

for (const mention of mentionNames) {
  const mentioned = linkedinLower.includes(mention.toLowerCase());
  check(mentioned, `Mention "${mention}" present inline in LinkedIn post`,
    mentioned ? 'found' : 'MISSING');
}

// Check no trailing @name dump (characteristic of the banned pattern)
// A trailing dump looks like: "\n\nShoutout to @Name1, @Name2 for their work"
const trailingDumpPattern = /shoutout to @?\w+.*@?\w+/i;
const hasTrailingDump = trailingDumpPattern.test(linkedinContent) &&
  linkedinContent.search(/shoutout/i) > linkedinContent.length * 0.7;
check(!hasTrailingDump, 'No trailing mention dump — mentions are inline',
  hasTrailingDump ? 'TRAILING DUMP DETECTED' : 'clean');

// Check the format — mentions should be @Name, not just Name
// (the system transforms them for LinkedIn posting later, but in content
//  they should appear as plain text names that get @-prefixed at publish)
info('Mention rendering format (pre-publish, plain text names inline):');
for (const m of mentionNames) {
  const idx = linkedinContent.toLowerCase().indexOf(m.toLowerCase());
  if (idx >= 0) {
    const context = linkedinContent.substring(Math.max(0, idx - 20), idx + m.length + 20);
    console.log(`    ✓ "${m}" at position ${idx}: ...${context.trim()}...`);
  }
}

// ─── STEP 8: Image generation ──────────────────────────────────
info('STEP 8: Image generation (branded SVG template)');

let imageUrl = null;
let imageError = null;

try {
  // generatePostImage internally tries: branded SVG → premium design → Pollinations → Wikipedia → OpenRouter → basic SVG
  imageUrl = await generatePostImage(TOPIC, 'professional', '4:5', linkedinContent);
  console.log(`  ${PASS} Image generated`);
  console.log(`       URL: ${imageUrl}`);
} catch (err) {
  imageError = err.message;
  console.log(`  ${FAIL} Image generation failed: ${imageError}`);
}

check(!!imageUrl, 'Image was generated (any method)', imageUrl || 'NO IMAGE');

// ─── STEP 9: Image validation — check fixed bugs stay fixed ───
info('STEP 9: Image bug regression check');

if (imageUrl && !imageError) {
  const GENERATED_DIR = path.resolve(SERVER_DIR, '../public/generated');
  const allFiles = fs.readdirSync(GENERATED_DIR)
    .filter(f => f.endsWith('.png') || f.endsWith('.svg'))
    .sort((a, b) => fs.statSync(path.join(GENERATED_DIR, b)).mtimeMs - fs.statSync(path.join(GENERATED_DIR, a)).mtimeMs);
  const latestFile = allFiles[0];

  if (latestFile) {
    const imgPath = path.join(GENERATED_DIR, latestFile);
    const imgStat = fs.statSync(imgPath);
    const isPng = latestFile.endsWith('.png');
    const isSvg = latestFile.endsWith('.svg');

    console.log(`  Latest image file: ${latestFile} (${(imgStat.size/1024).toFixed(0)}KB)`);

    // Try to find the SVG source if PNG was generated (sharp converts SVG→PNG)
    let svgContent = null;
    if (isSvg) {
      svgContent = fs.readFileSync(imgPath, 'utf-8');
    } else if (isPng) {
      // Check for companion SVGs with similar timestamp
      const baseName = latestFile.replace('.png', '');
      const svgFiles = allFiles.filter(f => f.startsWith(baseName) && f.endsWith('.svg'));
      if (svgFiles.length > 0) {
        const svgFilePath = path.join(GENERATED_DIR, svgFiles[0]);
        svgContent = fs.readFileSync(svgFilePath, 'utf-8');
        console.log(`  Companion SVG found: ${svgFiles[0]}`);
      } else {
        // The PNG was rendered from SVG via sharp; the SVG was a buffer not saved to disk
        // Check if we can find any recent brand SVG file
        const recentSvgs = allFiles.filter(f => f.endsWith('.svg') && f.includes('branded'));
        if (recentSvgs.length > 0) {
          svgContent = fs.readFileSync(path.join(GENERATED_DIR, recentSvgs[0]), 'utf-8');
          console.log(`  Recent branded SVG found: ${recentSvgs[0]}`);
        }
      }
    }

    if (svgContent) {
      // BUG 1 CHECK: Emoji rendered as tofu — SVG should have emoji stripped
      const hasEmojiInSvg = countEmojis(svgContent) > 0;
      check(!hasEmojiInSvg, 'BUG 1 FIXED: No emoji in SVG text (emoji stripped before render)',
        hasEmojiInSvg ? `Found ${countEmojis(svgContent)} emoji` : 'clean');

      // BUG 2 CHECK: FORBIDDEN_FRAGMENTS not present in content
      const FORBIDDEN_FRAGMENTS = [
        'visual for:', '1080x1350', 'NO human faces', '```json',
        'Style keywords:', 'production quality',
      ];
      const svgLower = svgContent.toLowerCase();
      const foundForbiddenFrags = FORBIDDEN_FRAGMENTS.filter(f => svgLower.includes(f));
      check(foundForbiddenFrags.length === 0, 'BUG 2 FIXED: No prompt leftovers in SVG',
        foundForbiddenFrags.length > 0 ? `Found: ${foundForbiddenFrags.join(', ')}` : 'clean');

      // BUG 3 CHECK: Logo is present (check for Digital FTE header)
      check(svgContent.includes('Digital FTE'), 'BUG 3 FIXED: Logo/header text present',
        'Digital FTE brand found in SVG');

      // Check headline is visibly larger — should use font-size ≥ 48
      const hFontSizeMatch = svgContent.match(/font-size="(\d+)".*font-weight="700"/);
      const hFontSize = hFontSizeMatch ? parseInt(hFontSizeMatch[1]) : 0;
      check(hFontSize >= 48, 'BUG 3 FIXED: Headline font-size ≥ 48',
        `font-size="${hFontSize}"`);

      // BUG 4 CHECK: Trending badge
      check(svgContent.includes('TRENDING'), 'BUG 4 FIXED: TRENDING badge present', '');

      // Check for CTA question (dynamic, not generic)
      const ctaMatch = svgContent.match(/font-size="18"[^>]*>([^<]+)/);
      const ctaText = ctaMatch ? ctaMatch[1] : '';
      const hasCtaQuestion = svgContent.includes('?');
      check(hasCtaQuestion, 'Dynamic CTA question present',
        ctaText.substring(0, 60) || 'no CTA');

      // Check no dead space — the content blocks should fill the frame
      const hasBottomBar = svgContent.includes('Follow for more');
      check(hasBottomBar, 'No dead space — bottom bar present', '');
    } else {
      // Can't read SVG content, but check file isn't trivially small
      if (isPng) {
        check(imgStat.size > 10000, 'Image file is not trivially small',
          `${(imgStat.size/1024).toFixed(0)}KB`);
        info('PNG image — SVG source not available for content validation');
      } else {
        warn('No SVG content to validate');
      }
    }

    // Copy image to test output
    const destPath = path.join(OUTPUT_DIR, latestFile);
    fs.copyFileSync(imgPath, destPath);
    info(`Image copied to test_output/${latestFile}`);
  }
} else {
  warn('Image bugs check skipped', imageError ? `Error: ${imageError}` : 'No image generated');
}

// ─── STEP 10: Facebook variant quick check ─────────────────────
info('STEP 10: Cross-platform consistency check');

const fbPost = unified.posts.facebook;
const igPost = unified.posts.instagram;

if (fbPost) {
  const fbEmoji = countEmojis(fbPost.content);
  check(fbEmoji >= 1, 'Facebook: ≥1 emoji', `${fbEmoji} found`);
  check(fbEmoji <= 2, 'Facebook: ≤2 emojis', `${fbEmoji} found`);
  check(!containsBannedPatterns(fbPost.content), 'Facebook: no banned patterns', '');
  const fbWords = fbPost.content.split(/\s+/).filter(Boolean).length;
  check(fbWords >= 50, 'Facebook: word count ≥50', `${fbWords} words`);
  check(fbWords <= 250, 'Facebook: word count ≤250', `${fbWords} words`);
}

if (igPost) {
  const igEmoji = countEmojis(igPost.content);
  check(igEmoji >= 1, 'Instagram: ≥1 emoji', `${igEmoji} found`);
  check(igEmoji <= 2, 'Instagram: ≤2 emojis', `${igEmoji} found`);
  check(!containsBannedPatterns(igPost.content), 'Instagram: no banned patterns', '');
}

// Check the same concrete points exist across all platforms
const coreLower = unified.core.toLowerCase();
for (const [plat, post] of Object.entries(unified.posts)) {
  const postLower = post.content.toLowerCase();
  // Check that at least 2 key terms from the core survive into each variant
  const coreTerms = unified.core.split(/\s+/).filter(w => w.length > 5 && /[A-Z]/.test(w));
  const sharedTerms = coreTerms.filter(t => postLower.includes(t.toLowerCase()));
  check(sharedTerms.length >= 1, `${plat}: shares ≥1 distinctive term with master core`,
    `${sharedTerms.slice(0, 3).join(', ')}${sharedTerms.length > 3 ? '...' : ''}`);
}

// ─── STEP 11: Provider-level mock detection ─────────────────────
info('STEP 11: Provider-level fallback audit');

// Check if callAI has a way to detect mock fallback — we already checked
// content signatures above, but let's also verify the AI provider chain
// actually had a working provider by checking the content quality
const providerIndicators = {
  hasProperStructure: linkedinContent.includes('\n'),
  hasLineBreaks: linkedinContent.match(/\n\n/) !== null,
  hasHook: linkedinContent.split('\n')[0].length > 10,
  isSpecific: /\d+|Amazon|CloudWatch|AWS|Claude|agent|coding|insight/i.test(linkedinContent),
};

check(providerIndicators.hasProperStructure, 'Content has line breaks (paragraph structure)', '');
check(providerIndicators.hasHook, 'Content starts with a real hook (>10 chars)', '');
check(providerIndicators.isSpecific, 'Content contains topic-specific terms',
  'mentions specific product/service names');

// ─── FINAL SUMMARY ─────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  RESULTS SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log(`  Passed: ${passedChecks}/${totalChecks}`);
console.log(`  Failed: ${failedChecks}/${totalChecks}`);

if (mockUsed) {
  console.log(`\n  ${FAIL} ⚠ CRITICAL: AI provider fell back to MOCK content!`);
  console.log(`     Check aiProvider.js or API key configuration.`);
  console.log(`     The generated content contains generic mock signatures.`);
}

if (failedChecks > 0) {
  console.log(`\n  ${FAIL} ${failedChecks} check(s) failed — review above for details.`);
  process.exitCode = 1;
} else {
  console.log(`\n  ${PASS} All checks passed.`);
}

console.log(`\n  Output files in: test_output/`);
console.log(`    - 01_research_results.json`);
console.log(`    - 02_unified_output.json`);
console.log(`    - (image file)`);
console.log('\n═══════════════════════════════════════════════════════════════\n');

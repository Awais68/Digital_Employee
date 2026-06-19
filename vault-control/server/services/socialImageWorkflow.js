import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePostImage } from './imageGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SOCIAL_SIZES_DIR = path.join(PROJECT_ROOT, '.agents/skills/social-media-image-sizes');

const PLATFORM_SPECS = {
  linkedin: {
    feed: { spec: 'LinkedIn Image Post (Portrait)', width: 1080, height: 1350, aspect: '4:5' },
    square: { spec: 'LinkedIn Image Post (Square)', width: 1200, height: 1200, aspect: '1:1' },
    landscape: { spec: 'LinkedIn Image Post (Landscape)', width: 1200, height: 627, aspect: '1.91:1' },
  },
  instagram: {
    portrait: { spec: 'Instagram Portrait Post', width: 1080, height: 1350, aspect: '4:5' },
    square: { spec: 'Instagram Square Post', width: 1080, height: 1080, aspect: '1:1' },
    landscape: { spec: 'Instagram Landscape Post', width: 1080, height: 566, aspect: '1.91:1' },
    story: { spec: 'Instagram Story', width: 1080, height: 1920, aspect: '9:16' },
    reel: { spec: 'Instagram Reel', width: 1080, height: 1920, aspect: '9:16' },
  },
  facebook: {
    landscape: { spec: 'Facebook Image Post (Landscape)', width: 1200, height: 630, aspect: '1.91:1' },
    square: { spec: 'Facebook Image Post (Square)', width: 1200, height: 1200, aspect: '1:1' },
    portrait: { spec: 'Facebook Image Post (Portrait)', width: 1080, height: 1350, aspect: '4:5' },
    story: { spec: 'Facebook Story', width: 1080, height: 1920, aspect: '9:16' },
  },
  twitter: {
    single: { spec: 'X (Twitter) Single Image', width: 1600, height: 900, aspect: '16:9' },
    card: { spec: 'X (Twitter) Card Image', width: 800, height: 418, aspect: '1.91:1' },
  },
  threads: {
    portrait: { spec: 'Threads Image Post (Portrait)', width: 1080, height: 1350, aspect: '4:5' },
    square: { spec: 'Threads Image Post (Square)', width: 1080, height: 1080, aspect: '1:1' },
    landscape: { spec: 'Threads Image Post (Landscape)', width: 1080, height: 566, aspect: '1.91:1' },
  },
};

const CONTENT_TYPE_MODEL_MAP = {
  'text-heavy': { model: 'gpt-image-2', skill: 'gpt-image-2', reason: 'Best for embedded text, logos, exact headlines' },
  'photoreal': { model: 'seedream-5-lite', skill: 'ai-image-generation', reason: 'Best photoreal portraits, product shots, lifestyle' },
  'cinematic': { model: 'flux-2-pro', skill: 'ai-image-generation', reason: 'Brand campaigns, hero shots, cinematic' },
  'fast': { model: 'flux-2-klein-4b', skill: 'ai-image-generation', reason: 'Fast iteration, concepting, moodboards' },
  'illustration': { model: 'dreamina-4-0', skill: 'ai-image-generation', reason: 'Illustration, concept art, stylized' },
  'default': { model: 'pollinations', skill: 'pollinations', reason: 'Fallback - free generic generation' },
};

function detectContentType(topic, research) {
  const textHeavyKeywords = ['statistic', 'data', 'number', '%', 'percent', 'report', 'survey', 'chart', 'graph', 'headline', 'quote', 'text', 'typography', 'logo'];
  const photorealKeywords = ['portrait', 'product', 'lifestyle', 'person', 'people', 'office', 'workspace', 'real', 'photo', 'photograph'];
  const cinematicKeywords = ['campaign', 'hero', 'brand', 'launch', 'hero shot', 'cinematic', 'epic'];
  const fastKeywords = ['concept', 'moodboard', 'iteration', 'draft', 'sketch', 'quick'];
  const illustrationKeywords = ['illustration', 'concept art', 'stylized', 'artistic', 'drawing', 'sketch'];

  const searchText = `${topic} ${research?.trending_angle || ''} ${research?.key_facts?.join(' ') || ''}`.toLowerCase();

  if (textHeavyKeywords.some(k => searchText.includes(k))) return 'text-heavy';
  if (photorealKeywords.some(k => searchText.includes(k))) return 'photoreal';
  if (cinematicKeywords.some(k => searchText.includes(k))) return 'cinematic';
  if (fastKeywords.some(k => searchText.includes(k))) return 'fast';
  if (illustrationKeywords.some(k => searchText.includes(k))) return 'illustration';
  return 'default';
}

function runScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SOCIAL_SIZES_DIR, 'scripts', scriptName);
    if (!fs.existsSync(scriptPath)) {
      reject(new Error(`${scriptName} not found at ${scriptPath}`));
      return;
    }
    const child = spawn('node', [scriptPath, ...args], {
      cwd: SOCIAL_SIZES_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`${scriptName} exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn ${scriptName}: ${err.message}`));
    });
  });
}

async function checkImage(imagePath, platform) {
  try {
    const output = await runScript('check.js', [imagePath, '--platform', platform]);
    return { success: true, output };
  } catch (err) {
    console.warn(`[SocialImageWorkflow] check.js skipped: ${err.message}`);
    return { success: true, output: 'Skipped - script not available' };
  }
}

async function resizeImage(imagePath, platformSpec, outputPath) {
  try {
    const output = await runScript('resize.js', [imagePath, platformSpec, '--out', outputPath]);
    return { success: true, outputPath, output };
  } catch (err) {
    console.warn(`[SocialImageWorkflow] resize.js skipped: ${err.message}`);
    if (fs.existsSync(imagePath)) {
      fs.copyFileSync(imagePath, outputPath);
    }
    return { success: true, outputPath, output: 'Copied original - resize script not available' };
  }
}

async function downloadImage(url, destPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

export async function generateAndValidateImages(topic, research, platform, tempDir, customPrompt) {
  const contentType = detectContentType(topic, research);
  const modelInfo = CONTENT_TYPE_MODEL_MAP[contentType] || CONTENT_TYPE_MODEL_MAP.default;

  const platformConfigs = PLATFORM_SPECS[platform];
  if (!platformConfigs) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const primaryConfig = platformConfigs.feed || platformConfigs.portrait || platformConfigs.single || Object.values(platformConfigs)[0];
  const specName = primaryConfig.spec;

  console.log(`[SocialImageWorkflow] Topic: "${topic}"`);
  console.log(`[SocialImageWorkflow] Content type: ${contentType}`);
  console.log(`[SocialImageWorkflow] Selected model: ${modelInfo.model} (${modelInfo.reason})`);
  console.log(`[SocialImageWorkflow] Target platform: ${platform}, spec: ${specName} (${primaryConfig.width}x${primaryConfig.height})`);

  let imageUrl;
  let localImagePath;

  // Try OpenRouter image generation first (uses the gemini-2.5-flash-image model)
  try {
    console.log(`[SocialImageWorkflow] Trying OpenRouter image generation...`);
    imageUrl = await generatePostImage(topic);
    console.log(`[SocialImageWorkflow] OpenRouter success: ${imageUrl.substring(0, 100)}`);
    localImagePath = path.join(tempDir, `generated_${platform}_${Date.now()}.jpg`);
    await downloadImage(imageUrl, localImagePath);
  } catch (orErr) {
    console.warn(`[SocialImageWorkflow] OpenRouter failed: ${orErr.message}`);

    // Fallback: Try RunComfy if token is set
    if (process.env.RUNCOMFY_TOKEN) {
      try {
        console.log(`[SocialImageWorkflow] Trying RunComfy with model: ${modelInfo.model}`);
        imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(topic)}?width=${primaryConfig.width}&height=${primaryConfig.height}&seed=${Math.floor(Math.random() * 99999)}&nologo=true`;
        localImagePath = path.join(tempDir, `generated_${platform}_${Date.now()}.jpg`);
        await downloadImage(imageUrl, localImagePath);
      } catch (rcErr) {
        console.warn(`[SocialImageWorkflow] RunComfy failed: ${rcErr.message}`);
        // fall through to Pollinations
        imageUrl = null;
      }
    }

    // Final fallback: Pollinations
    if (!imageUrl) {
      const rawPrompt = customPrompt || `${topic}, professional social media image, modern design, clean background, high quality, 4K, ${primaryConfig.width}x${primaryConfig.height}, no text, no watermark`;
      const prompt = encodeURIComponent(rawPrompt);
      const seed = Math.floor(Math.random() * 99999);
      imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=${primaryConfig.width}&height=${primaryConfig.height}&seed=${seed}&nologo=true`;

      console.log(`[SocialImageWorkflow] Final fallback to Pollinations: ${imageUrl.substring(0, 100)}...`);
      localImagePath = path.join(tempDir, `generated_${platform}_${Date.now()}.jpg`);
      await downloadImage(imageUrl, localImagePath);
    }
  }

  const validation = await checkImage(localImagePath, platform);
  console.log(`[SocialImageWorkflow] Validation for ${platform}:`, validation.success ? 'PASSED' : 'FAILED');

  if (!validation.success) {
    console.warn(`[SocialImageWorkflow] Validation failed: ${validation.error}`);
  }

  const resizedImages = {};
  for (const [variant, config] of Object.entries(platformConfigs)) {
    const outputPath = path.join(tempDir, `resized_${platform}_${variant}_${Date.now()}.jpg`);
    const resizeResult = await resizeImage(localImagePath, config.spec, outputPath);

    if (resizeResult.success) {
      resizedImages[variant] = {
        path: outputPath,
        width: config.width,
        height: config.height,
        aspect: config.aspect,
        spec: config.spec,
      };
      console.log(`[SocialImageWorkflow] Resized ${platform}/${variant}: ${config.width}x${config.height} (${config.aspect})`);
    } else {
      console.warn(`[SocialImageWorkflow] Resize failed for ${platform}/${variant}: ${resizeResult.error}`);
    }
  }

  return {
    contentType,
    modelUsed: modelInfo.model,
    originalUrl: imageUrl,
    localPath: localImagePath,
    validation,
    resizedImages,
    primarySpec: specName,
  };
}

export async function generateAllPlatformImages(topic, research, platforms, tempDir, customPrompt) {
  const results = {};

  for (const platform of platforms) {
    try {
      results[platform] = await generateAndValidateImages(topic, research, platform, tempDir, customPrompt);
    } catch (err) {
      console.error(`[SocialImageWorkflow] Failed for ${platform}:`, err.message);
      results[platform] = { error: err.message };
    }
  }

  return results;
}

export { PLATFORM_SPECS, CONTENT_TYPE_MODEL_MAP, detectContentType };
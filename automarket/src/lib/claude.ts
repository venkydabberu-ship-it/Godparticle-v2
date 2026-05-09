import Anthropic from '@anthropic-ai/sdk';
import type { Tone, ContentType, Platform } from './supabase';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface GenerateContentInput {
  idea: string; platform: Platform; contentType: ContentType; tone: Tone; productContext?: string;
}

export interface GeneratedContent {
  hook: string; caption: string; hashtags: string[]; script: string; cta: string;
}

const PRODUCT_CONTEXT = `
Product: GodParticle (GodParticle.in)
- AI-powered options trading platform for Indian stock market (NSE/BSE)
- Key feature: "God Particle" — proprietary metric revealing institutional cost basis in options
- Zero-to-Hero: Expiry-day signal engine (fires Tuesdays for Nifty, Thursdays for Sensex)
- Gravitational Cost Theory: identifies institutional gravity in large-cap stocks
- Target audience: Indian retail option traders, 25-45 age group, Hindi/English bilingual
- Plans: Free, Basic (₹999/mo), Premium (₹1,999/mo)
- Tone on social: Bold, slightly edgy, uses trader slang, occasionally Hindi phrases
`;

const TONE_INSTRUCTIONS: Record<Tone, string> = {
  viral: 'Make it highly shareable. Use pattern interrupts, surprising facts, bold claims backed by logic.',
  educational: 'Explain one concept clearly in simple terms. Use analogies. End with a clear takeaway.',
  funny: 'Use trader memes, relatable pain points, self-deprecating humor.',
  inspirational: 'Aspirational tone. Before/after narrative. Emotional resonance without being cheesy.',
  behind_scenes: 'Authentic, raw, "sneak peek" energy. Data-driven with dramatic presentation.',
};

export async function generateContent(input: GenerateContentInput): Promise<GeneratedContent> {
  const { idea, platform, contentType, tone } = input;
  const platformNote = platform === 'instagram'
    ? 'Instagram Reels/Posts (Indian audience, max 2200 char caption, 30 hashtags)'
    : platform === 'youtube' ? 'YouTube Shorts (max 100 char title as hook)' : 'Both Instagram and YouTube';

  const prompt = `You are an expert viral social media content creator for a fintech product targeting Indian option traders.

${PRODUCT_CONTEXT}

PLATFORM: ${platformNote}
CONTENT TYPE: ${contentType}
TONE INSTRUCTION: ${TONE_INSTRUCTIONS[tone]}
USER'S IDEA: "${idea}"

Generate a complete content package. Respond ONLY with valid JSON:
{
  "hook": "First 3-5 seconds script. Max 2 sentences. IRRESISTIBLE.",
  "caption": "Full caption with line breaks (use \\n). Include emojis. Max 2200 chars.",
  "hashtags": ["array", "of", "30", "hashtags", "no", "hash", "symbol"],
  "script": "Full video script with timestamps. Format: [0:00] - narration\\n[0:03] - visual cue",
  "cta": "Single clear call-to-action including GodParticle.in"
}

Rules: hashtags must have exactly 30 items, no # prefix. Keep it authentic to Indian trader community.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: 'You are a viral social media content expert. Always respond with valid JSON only, no markdown fences.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text) as GeneratedContent;
}

export async function regenerateSection(
  section: keyof GeneratedContent,
  currentContent: GeneratedContent,
  idea: string,
  tone: Tone
): Promise<string | string[]> {
  const prompt = `You are a viral content creator for GodParticle (Indian options trading platform).

${PRODUCT_CONTEXT}

Original idea: "${idea}"
Tone: ${TONE_INSTRUCTIONS[tone]}

Current content:
${JSON.stringify(currentContent, null, 2)}

Regenerate ONLY the "${section}" field. Make it better, punchier, more viral.
Respond with ONLY the raw value (string or array) — no JSON wrapper, no explanation.
${section === 'hashtags' ? 'Return a JSON array of 30 strings without # symbols.' : ''}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
  if (section === 'hashtags') return JSON.parse(text) as string[];
  return text;
}

import { createClient } from '@supabase/supabase-js';

const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side singleton (uses NEXT_PUBLIC_ vars baked at build time)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  anon,
);

// Server-side admin client — reads URL fresh at call-time so it works
// even when NEXT_PUBLIC_SUPABASE_URL was not baked into the server bundle
export const supabaseAdmin = () => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) {
    throw new Error(
      `Missing Supabase env vars — SUPABASE_URL: ${url ? 'OK' : 'MISSING'}, SUPABASE_SERVICE_ROLE_KEY: ${svc ? 'OK' : 'MISSING'}`,
    );
  }
  return createClient(url, svc, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

export type ContentStatus =
  | 'draft' | 'generating' | 'awaiting_approval'
  | 'approved' | 'scheduled' | 'posted' | 'rejected' | 'failed';

export type Platform = 'instagram' | 'youtube' | 'both';
export type ContentType = 'reel' | 'post' | 'story' | 'short' | 'carousel';
export type Tone = 'viral' | 'educational' | 'funny' | 'inspirational' | 'behind_scenes';

export interface AmContent {
  id: string;
  created_at: string;
  updated_at: string;
  idea_text: string;
  image_urls: string[];
  video_url: string | null;
  platform: Platform;
  content_type: ContentType;
  tone: Tone;
  ai_hook: string | null;
  ai_caption: string | null;
  ai_hashtags: string[] | null;
  ai_script: string | null;
  ai_cta: string | null;
  ai_generated_at: string | null;
  final_caption: string | null;
  final_hashtags: string[] | null;
  status: ContentStatus;
  scheduled_at: string | null;
  posted_at: string | null;
  rejection_note: string | null;
  ig_media_id: string | null;
  ig_permalink: string | null;
  ig_like_count: number | null;
  ig_comment_count: number | null;
  yt_video_id: string | null;
  yt_url: string | null;
}

export interface AmAutomationRule {
  id: string;
  created_at: string;
  name: string;
  platform: Platform;
  trigger_type: string;
  trigger_keywords: string[];
  match_mode: 'any' | 'all' | 'exact';
  action_type: string;
  action_message: string | null;
  delay_seconds: number;
  is_active: boolean;
  trigger_count: number;
  last_fired_at: string | null;
}

export interface AmIdea {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_reach: string;
  title: string;
  hook_template: string | null;
  caption_template: string | null;
  hashtag_pack: string[];
  trending_audio: string | null;
  best_time: string | null;
  is_active: boolean;
}

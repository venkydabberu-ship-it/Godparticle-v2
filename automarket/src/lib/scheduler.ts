import { supabaseAdmin } from './supabase';
import type { AmContent } from './supabase';
import { createImageContainer, createReelContainer, createCarouselContainer, publishMedia, pollContainerStatus } from './instagram';

export async function publishContent(content: AmContent): Promise<void> {
  const db = supabaseAdmin();
  const caption = buildCaption(content);
  try {
    await db.from('am_content').update({ status: 'posting' as never }).eq('id', content.id);
    if (content.platform === 'instagram' || content.platform === 'both') await publishToInstagram(content, caption, db);
    if (content.platform === 'youtube'   || content.platform === 'both') await publishToYouTube(content, caption, db);
    await db.from('am_content').update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', content.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.from('am_content').update({ status: 'failed', rejection_note: msg }).eq('id', content.id);
    throw err;
  }
}

function buildCaption(c: AmContent): string {
  const caption = c.final_caption ?? c.ai_caption ?? '';
  const tags    = (c.final_hashtags ?? c.ai_hashtags ?? []).map(h => `#${h}`).join(' ');
  const cta     = c.ai_cta ?? '';
  return [caption, cta, '', tags].filter(Boolean).join('\n').trim();
}

async function publishToInstagram(c: AmContent, caption: string, db: ReturnType<typeof supabaseAdmin>) {
  let creationId: string;
  if (c.content_type === 'reel' && c.video_url) {
    creationId = await createReelContainer(c.video_url, caption, c.image_urls?.[0]);
    await pollContainerStatus(creationId);
  } else if (c.content_type === 'carousel' && c.image_urls.length > 1) {
    creationId = await createCarouselContainer(c.image_urls, caption);
  } else {
    creationId = await createImageContainer(c.image_urls[0], caption);
  }
  const { id: mediaId, permalink } = await publishMedia(creationId);
  await db.from('am_content').update({ ig_media_id: mediaId, ig_permalink: permalink }).eq('id', c.id);
}

async function publishToYouTube(c: AmContent, caption: string, db: ReturnType<typeof supabaseAdmin>) {
  if (!c.video_url) return;
  const { uploadShort } = await import('./youtube');
  const hook = c.ai_hook ?? c.idea_text;
  const { videoId, url } = await uploadShort({ videoUrl: c.video_url, title: hook.slice(0, 100), description: caption, tags: (c.final_hashtags ?? c.ai_hashtags ?? []) });
  await db.from('am_content').update({ yt_video_id: videoId, yt_url: url }).eq('id', c.id);
}

export async function processScheduledPosts(): Promise<{ processed: number; errors: string[] }> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: due } = await db.from('am_content').select('*').eq('status', 'scheduled').lte('scheduled_at', now);
  if (!due?.length) return { processed: 0, errors: [] };
  const errors: string[] = [];
  for (const item of due) {
    try { await publishContent(item as AmContent); } catch (e) { errors.push(`${item.id}: ${e}`); }
  }
  return { processed: due.length, errors };
}

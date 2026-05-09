import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import type { AmContent } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { contentId } = await req.json() as { contentId: string };
    const db = supabaseAdmin();
    const { data: content, error } = await db.from('am_content').select('*').eq('id', contentId).single();
    if (error || !content) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    if (!content.video_url) return NextResponse.json({ error: 'No video URL attached to this content' }, { status: 400 });
    const c = content as AmContent;
    const caption = [c.final_caption ?? c.ai_caption ?? '', c.ai_cta ?? ''].filter(Boolean).join('\n\n');
    const tags = c.final_hashtags ?? c.ai_hashtags ?? [];
    const { uploadShort } = await import('@/lib/youtube');
    const { videoId, url } = await uploadShort({ videoUrl: c.video_url!, title: (c.ai_hook ?? c.idea_text).slice(0, 100), description: caption, tags });
    await db.from('am_content').update({ yt_video_id: videoId, yt_url: url, status: 'posted', posted_at: new Date().toISOString() }).eq('id', contentId);
    return NextResponse.json({ success: true, videoId, url });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

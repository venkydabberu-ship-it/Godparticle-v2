import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { runVideoPipeline } from '@/lib/video/pipeline';
import type { AmContent } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { contentId: string; voiceId?: string; bgMusic?: string; subtitleStyle?: string; };
    const db = supabaseAdmin();
    const { data: content, error } = await db.from('am_content').select('*').eq('id', body.contentId).single();
    if (error || !content) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    if (!content.ai_script && !content.ai_caption)
      return NextResponse.json({ error: 'Generate AI content first before making a video' }, { status: 400 });
    const { data: existing } = await db.from('am_video_jobs').select('id, status')
      .eq('content_id', body.contentId)
      .in('status', ['queued','generating_voice','rendering_video','merging_audio','generating_subtitles','burning_subtitles','uploading'])
      .single();
    if (existing) return NextResponse.json({ jobId: existing.id, alreadyRunning: true });
    const { data: job, error: jobErr } = await db.from('am_video_jobs').insert({
      content_id: body.contentId,
      voice_id: body.voiceId ?? 'pNInz6obpgDQGcFmaJgB',
      bg_music: body.bgMusic ?? 'none',
      subtitle_style: body.subtitleStyle ?? 'bold',
      status: 'queued', progress: 0, current_step: 'Queued...',
    }).select().single();
    if (jobErr || !job) return NextResponse.json({ error: 'Failed to create job' }, { status: 500 });
    runVideoPipeline(job.id as string, content as AmContent).catch(err => {
      console.error(`[video-pipeline] Job ${job.id} failed:`, err);
    });
    return NextResponse.json({ jobId: job.id, status: 'queued' });
  } catch (e) {
    console.error('Video generate error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

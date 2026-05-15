import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { runVideoPipeline } from '@/lib/video/pipeline';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { contentId, voiceId = 'pNInz6obpgDQGcFmaJgB', bgMusic = 'none', subtitleStyle = 'bold' } = await req.json() as {
      contentId: string;
      voiceId?: string;
      bgMusic?: string;
      subtitleStyle?: string;
    };

    const db = supabaseAdmin();

    const { data: content, error: ce } = await db.from('am_content').select('*').eq('id', contentId).single();
    if (ce || !content) return NextResponse.json({ error: 'Content not found' }, { status: 404 });

    const { data: job, error: je } = await db.from('am_video_jobs').insert({
      content_id: contentId,
      voice_id: voiceId,
      bg_music: bgMusic,
      subtitle_style: subtitleStyle,
      status: 'queued',
      progress: 0,
    }).select().single();
    if (je || !job) return NextResponse.json({ error: `Job create failed: ${je?.message}` }, { status: 500 });

    await runVideoPipeline(job.id, content as never);

    const { data: finished } = await db.from('am_video_jobs').select('*').eq('id', job.id).single();
    return NextResponse.json({ success: true, jobId: job.id, job: finished });

  } catch (e) {
    console.error('Video generate error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  const { data: job, error } = await db
    .from('am_video_jobs')
    .select('id,status,progress,current_step,audio_url,raw_video_url,subtitles_url,final_video_url,duration_seconds,file_size_bytes,error_msg,completed_at')
    .eq('id', params.id).single();
  if (error || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = supabaseAdmin();
  await db.from('am_video_jobs').update({ status: 'failed', error_msg: 'Cancelled by user' }).eq('id', params.id).eq('status', 'queued');
  return NextResponse.json({ cancelled: true });
}

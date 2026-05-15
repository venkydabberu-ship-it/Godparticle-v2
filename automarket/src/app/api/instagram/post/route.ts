import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { publishContent } from '@/lib/scheduler';
import type { AmContent } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { contentId, scheduleAt } = await req.json() as { contentId: string; scheduleAt?: string };
    const db = supabaseAdmin();
    const { data: content, error } = await db.from('am_content').select('*').eq('id', contentId).single();
    if (error || !content) return NextResponse.json({ error: 'Content not found' }, { status: 404 });
    if (content.status !== 'approved' && content.status !== 'scheduled') {
      return NextResponse.json({ error: 'Content must be approved before posting' }, { status: 400 });
    }
    if (scheduleAt) {
      await db.from('am_content').update({ status: 'scheduled', scheduled_at: scheduleAt, updated_at: new Date().toISOString() }).eq('id', contentId);
      return NextResponse.json({ success: true, scheduled: true, scheduledAt: scheduleAt });
    }
    await publishContent(content as AmContent);
    return NextResponse.json({ success: true, posted: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

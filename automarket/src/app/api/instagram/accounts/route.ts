import { NextResponse } from 'next/server';
import { getAccountInfo } from '@/lib/instagram';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    const info = await getAccountInfo() as {
      id: string; username: string; name: string;
      followers_count: number; follows_count: number; media_count: number;
    };
    const db = supabaseAdmin();
    await db.from('am_accounts').upsert({
      platform: 'instagram', display_name: info.name, handle: info.username,
      platform_id: info.id, is_connected: true, follower_count: info.followers_count,
      following_count: info.follows_count, media_count: info.media_count,
      last_synced_at: new Date().toISOString(),
    }, { onConflict: 'platform' });
    return NextResponse.json({ success: true, account: info });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { generateContent, regenerateSection } from '@/lib/claude';
import { supabaseAdmin } from '@/lib/supabase';
import type { Tone, ContentType, Platform } from '@/lib/supabase';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      idea: string;
      platform: Platform;
      contentType: ContentType;
      tone: Tone;
      imageUrls?: string[];
    };

    const db = supabaseAdmin();

    // Create DB record server-side (avoids needing NEXT_PUBLIC_SUPABASE_URL on client)
    const { data: record, error: dbErr } = await db
      .from('am_content')
      .insert({
        idea_text: body.idea,
        image_urls: body.imageUrls ?? [],
        platform: body.platform,
        content_type: body.contentType,
        tone: body.tone,
        status: 'generating',
      })
      .select()
      .single();

    if (dbErr || !record) {
      return NextResponse.json({ error: `DB insert failed: ${dbErr?.message}` }, { status: 500 });
    }

    const result = await generateContent({
      idea: body.idea,
      platform: body.platform,
      contentType: body.contentType,
      tone: body.tone,
    });

    await db.from('am_content').update({
      ai_hook: result.hook,
      ai_caption: result.caption,
      ai_hashtags: result.hashtags,
      ai_script: result.script,
      ai_cta: result.cta,
      ai_generated_at: new Date().toISOString(),
      status: 'awaiting_approval',
      updated_at: new Date().toISOString(),
    }).eq('id', record.id);

    return NextResponse.json({ success: true, contentId: record.id, content: result });
  } catch (e) {
    console.error('Generate error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json() as {
      contentId: string;
      section: string;
      currentContent: Record<string, unknown>;
      idea: string;
      tone: Tone;
    };

    const result = await regenerateSection(
      body.section as never,
      body.currentContent as never,
      body.idea,
      body.tone,
    );

    const db = supabaseAdmin();
    const field = `ai_${body.section}`;
    await db.from('am_content').update({ [field]: result, updated_at: new Date().toISOString() }).eq('id', body.contentId);

    return NextResponse.json({ success: true, value: result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, replyToComment, sendDM, likeComment } from '@/lib/instagram';
import { supabaseAdmin } from '@/lib/supabase';
import type { AmAutomationRule } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode === 'subscribe' && token === process.env.CRON_SECRET) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }
  const payload = JSON.parse(rawBody) as WebhookPayload;
  await processWebhookEvent(payload);
  return NextResponse.json({ received: true });
}

interface WebhookPayload { object: string; entry: WebhookEntry[]; }
interface WebhookEntry { id: string; changes?: WebhookChange[]; messaging?: WebhookMessage[]; }
interface WebhookChange { field: string; value: { text?: string; from?: { id: string; username?: string }; id?: string; }; }
interface WebhookMessage { sender: { id: string }; message?: { text?: string }; }

async function processWebhookEvent(payload: WebhookPayload) {
  const db = supabaseAdmin();
  const { data: rules } = await db.from('am_automation_rules').select('*').eq('is_active', true).eq('platform', 'instagram');
  if (!rules?.length) return;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'comments') {
        const text = change.value.text ?? '';
        const fromId = change.value.from?.id ?? '';
        const username = change.value.from?.username ?? '';
        const commentId = change.value.id ?? '';
        for (const rule of rules as AmAutomationRule[]) {
          if (!matchesTrigger(rule, 'comment_keyword', text)) continue;
          const message = buildMessage(rule.action_message ?? '', username);
          await fireAction(rule, commentId, fromId, message, db, { trigger_type: 'comment', text, username });
        }
      }
    }
    for (const msg of entry.messaging ?? []) {
      const text = msg.message?.text ?? '';
      const senderId = msg.sender.id;
      for (const rule of rules as AmAutomationRule[]) {
        if (!matchesTrigger(rule, 'dm_keyword', text)) continue;
        const message = buildMessage(rule.action_message ?? '', '');
        await fireAction(rule, '', senderId, message, db, { trigger_type: 'dm', text });
      }
    }
  }
}

function matchesTrigger(rule: AmAutomationRule, triggerType: string, text: string): boolean {
  if (rule.trigger_type !== triggerType) return false;
  if (!rule.trigger_keywords?.length) return true;
  const lower = text.toLowerCase();
  const keywords = rule.trigger_keywords.map(k => k.toLowerCase());
  if (rule.match_mode === 'all')   return keywords.every(k => lower.includes(k));
  if (rule.match_mode === 'exact') return keywords.some(k => lower === k);
  return keywords.some(k => lower.includes(k));
}

function buildMessage(template: string, username: string): string {
  return template.replace(/\{\{username\}\}/gi, username ? `@${username}` : 'there');
}

async function fireAction(rule: AmAutomationRule, commentId: string, userId: string, message: string, db: ReturnType<typeof supabaseAdmin>, triggerData: object) {
  const delay = rule.delay_seconds ?? 0;
  if (delay > 0) await new Promise(r => setTimeout(r, delay * 1000));
  let success = true;
  let errorMsg: string | undefined;
  try {
    if (rule.action_type === 'reply_comment' && commentId) await replyToComment(commentId, message);
    else if (rule.action_type === 'send_dm' && userId) await sendDM(userId, message);
    else if (rule.action_type === 'like_comment' && commentId) await likeComment(commentId);
  } catch (e) { success = false; errorMsg = String(e); }
  await db.from('am_automation_log').insert({ rule_id: rule.id, platform: 'instagram', trigger_data: triggerData, action_sent: message, success, error_msg: errorMsg });
  await db.from('am_automation_rules').update({ trigger_count: (rule.trigger_count ?? 0) + 1, last_fired_at: new Date().toISOString() }).eq('id', rule.id);
}

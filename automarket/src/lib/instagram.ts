const BASE = 'https://graph.instagram.com/v21.0';
const ACCOUNT_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID!;
const TOKEN      = process.env.INSTAGRAM_ACCESS_TOKEN!;

async function igFetch(path: string, opts: RequestInit = {}) {
  const url = path.startsWith('http') ? path : `${BASE}${path}`;
  const res  = await fetch(url, opts);
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(`IG API error: ${JSON.stringify(data)}`);
  return data;
}

export async function createImageContainer(imageUrl: string, caption: string): Promise<string> {
  const params = new URLSearchParams({ image_url: imageUrl, caption, access_token: TOKEN });
  const data = await igFetch(`/${ACCOUNT_ID}/media`, { method: 'POST', body: params }) as { id: string };
  return data.id;
}

export async function createReelContainer(videoUrl: string, caption: string, coverUrl?: string): Promise<string> {
  const params = new URLSearchParams({ media_type: 'REELS', video_url: videoUrl, caption, access_token: TOKEN, share_to_feed: 'true' });
  if (coverUrl) params.append('cover_url', coverUrl);
  const data = await igFetch(`/${ACCOUNT_ID}/media`, { method: 'POST', body: params }) as { id: string };
  return data.id;
}

export async function createCarouselContainer(imageUrls: string[], caption: string): Promise<string> {
  const childIds: string[] = await Promise.all(
    imageUrls.map(async (url) => {
      const params = new URLSearchParams({ image_url: url, is_carousel_item: 'true', access_token: TOKEN });
      const data = await igFetch(`/${ACCOUNT_ID}/media`, { method: 'POST', body: params }) as { id: string };
      return data.id;
    })
  );
  const params = new URLSearchParams({ media_type: 'CAROUSEL', children: childIds.join(','), caption, access_token: TOKEN });
  const data = await igFetch(`/${ACCOUNT_ID}/media`, { method: 'POST', body: params }) as { id: string };
  return data.id;
}

export async function publishMedia(creationId: string): Promise<{ id: string; permalink: string }> {
  const params = new URLSearchParams({ creation_id: creationId, access_token: TOKEN });
  const pub = await igFetch(`/${ACCOUNT_ID}/media_publish`, { method: 'POST', body: params }) as { id: string };
  const info = await igFetch(`/${pub.id}?fields=id,permalink&access_token=${TOKEN}`) as { id: string; permalink: string };
  return { id: pub.id, permalink: info.permalink };
}

export async function pollContainerStatus(creationId: string, maxWaitMs = 120_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const data = await igFetch(`/${creationId}?fields=status_code,status&access_token=${TOKEN}`) as { status_code: string; status?: string };
    if (data.status_code === 'FINISHED') return;
    if (data.status_code === 'ERROR') throw new Error(`Container processing failed: ${data.status}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Timed out waiting for media container');
}

export async function replyToComment(commentId: string, message: string): Promise<void> {
  const params = new URLSearchParams({ message, access_token: TOKEN });
  await igFetch(`/${commentId}/replies`, { method: 'POST', body: params });
}

export async function sendDM(userId: string, message: string): Promise<void> {
  await fetch(`https://graph.instagram.com/v21.0/me/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ recipient: { id: userId }, message: { text: message } }),
  });
}

export async function likeComment(commentId: string): Promise<void> {
  const params = new URLSearchParams({ access_token: TOKEN });
  await igFetch(`/${commentId}/likes`, { method: 'POST', body: params });
}

export async function getAccountInfo() {
  const fields = 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website';
  return igFetch(`/${ACCOUNT_ID}?fields=${fields}&access_token=${TOKEN}`);
}

export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const crypto = require('crypto') as typeof import('crypto');
  const expected = crypto.createHmac('sha256', process.env.INSTAGRAM_APP_SECRET!).update(payload).digest('hex');
  return `sha256=${expected}` === signature;
}

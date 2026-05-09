// YouTube Data API v3 + OAuth2

const YT_BASE   = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD = 'https://www.googleapis.com/upload/youtube/v3';

interface TokenResponse { access_token: string; expires_in: number; }

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json() as TokenResponse;
  return data.access_token;
}

export async function uploadShort(params: {
  videoUrl: string; title: string; description: string; tags: string[];
}): Promise<{ videoId: string; url: string }> {
  const token = await getAccessToken();
  const videoRes = await fetch(params.videoUrl);
  const videoBuffer = await videoRes.arrayBuffer();

  const metadata = {
    snippet: {
      title: params.title.slice(0, 100),
      description: params.description.slice(0, 5000),
      tags: params.tags.slice(0, 500),
      categoryId: '22',
    },
    status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  const metaPart = delimiter + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(metadata);
  const encoder = new TextEncoder();
  const metaBytes = encoder.encode(metaPart);
  const closeBytes = encoder.encode(closeDelimiter);
  const videoTypeHeader = encoder.encode(`\r\n--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`);
  const combined = new Uint8Array(
    metaBytes.byteLength + videoTypeHeader.byteLength + videoBuffer.byteLength + closeBytes.byteLength
  );
  let offset = 0;
  combined.set(metaBytes, offset); offset += metaBytes.byteLength;
  combined.set(videoTypeHeader, offset); offset += videoTypeHeader.byteLength;
  combined.set(new Uint8Array(videoBuffer), offset); offset += videoBuffer.byteLength;
  combined.set(closeBytes, offset);

  const res = await fetch(
    `${YT_UPLOAD}/videos?uploadType=multipart&part=snippet,status`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary="${boundary}"`,
      },
      body: combined,
    }
  );

  const data = await res.json() as { id: string };
  if (!res.ok) throw new Error(`YT upload failed: ${JSON.stringify(data)}`);
  return { videoId: data.id, url: `https://www.youtube.com/shorts/${data.id}` };
}

export async function getChannelStats() {
  const token = await getAccessToken();
  const channelId = process.env.YOUTUBE_CHANNEL_ID!;
  const res = await fetch(
    `${YT_BASE}/channels?part=statistics,snippet&id=${channelId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json() as { items: unknown[] };
  return data.items?.[0] ?? null;
}

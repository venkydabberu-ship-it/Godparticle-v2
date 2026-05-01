-- Social Media Marketing Automation Tables

-- Content items (photos/ideas submitted by admin)
create table if not exists social_media_content (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  platform text not null check (platform in ('instagram', 'youtube', 'both')),
  content_type text not null check (content_type in ('reel', 'post', 'story', 'short', 'carousel')),
  idea_text text not null,
  image_url text,
  video_url text,

  -- AI-generated content
  hook text,
  caption text,
  hashtags text[],
  video_script text,
  cta text,

  -- Workflow
  status text not null default 'draft' check (status in ('draft', 'generating', 'awaiting_approval', 'approved', 'scheduled', 'posted', 'rejected')),
  scheduled_at timestamptz,
  posted_at timestamptz,
  rejection_reason text,

  -- Instagram post details
  instagram_media_id text,
  instagram_permalink text,

  -- YouTube post details
  youtube_video_id text,
  youtube_url text,

  created_by uuid references auth.users(id)
);

-- Automation rules for follower interactions
create table if not exists social_media_automation_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  platform text not null check (platform in ('instagram', 'youtube', 'both')),
  trigger_type text not null check (trigger_type in ('comment_keyword', 'dm_keyword', 'new_follower', 'story_reply', 'post_tag')),
  trigger_keywords text[],
  action_type text not null check (action_type in ('reply_comment', 'send_dm', 'follow_back', 'like_comment')),
  action_message text,
  is_active boolean default true,
  trigger_count int default 0,

  created_by uuid references auth.users(id)
);

-- Social media account connections
create table if not exists social_media_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  platform text not null check (platform in ('instagram', 'youtube')),
  account_name text not null,
  account_id text,
  access_token text,
  token_expires_at timestamptz,
  is_connected boolean default false,
  follower_count int default 0,
  last_synced_at timestamptz,

  created_by uuid references auth.users(id)
);

-- Viral ideas bank (seeded by admin, usable by content studio)
create table if not exists social_media_ideas_bank (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),

  category text not null,
  title text not null,
  hook_template text,
  caption_template text,
  hashtag_pack text[],
  trending_audio text,
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  estimated_views text,
  is_active boolean default true
);

-- RLS: admin-only access
alter table social_media_content enable row level security;
alter table social_media_automation_rules enable row level security;
alter table social_media_accounts enable row level security;
alter table social_media_ideas_bank enable row level security;

create policy "admin_social_media_content" on social_media_content
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin_social_media_automation" on social_media_automation_rules
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin_social_media_accounts" on social_media_accounts
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin_social_media_ideas" on social_media_ideas_bank
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Seed the viral ideas bank with finance/trading content templates
insert into social_media_ideas_bank (category, title, hook_template, caption_template, hashtag_pack, trending_audio, difficulty, estimated_views) values
(
  'viral_hook',
  'The One Number Institutions Hide From Retail Traders',
  'POV: You just discovered the number that institutions NEVER want you to know about 👀',
  'Retail traders lose because they play the game without knowing the score.\n\nThis ONE number — the God Particle — is the gravitational center of every option position institutions write.\n\nWhen you know it, everything changes.\n\n📊 Where to find it? Link in bio → GodParticle.in\n\n💬 Comment "PARTICLE" and I''ll DM you how to use it in tomorrow''s trade.',
  ARRAY['#optionstrading', '#nifty', '#sensex', '#tradingtips', '#stockmarket', '#banknifty', '#retailtrader', '#godparticle', '#tradingsecretsrevealed', '#optionsselling', '#ivcrush', '#expiryday'],
  'Astronaut In The Ocean - Masked Wolf',
  'easy',
  '50K-200K'
),
(
  'educational',
  'Why 90% of Option Buyers Lose (Explained in 60 Seconds)',
  'If you''ve ever bought options and watched them go to zero even when you were RIGHT about direction — watch this 👇',
  'Here''s the brutal truth nobody tells you:\n\nYou can be right about direction and STILL lose money.\n\nIV crush. Theta decay. Time value erosion.\n\nThe game is rigged against option buyers — UNLESS you know where the institutional gravity is.\n\nThat''s exactly what GodParticle calculates for you.\n\n📌 Try it free → GodParticle.in\n\n🔁 Share this with a trader friend who needs to see it.',
  ARRAY['#optionbuying', '#ivcrush', '#thetadecay', '#whytraderslose', '#nifty50', '#stockmarket', '#tradingeducation', '#godparticle', '#optionseller', '#financialeducation'],
  'Sad Violin - trending sound',
  'medium',
  '100K-500K'
),
(
  'meme_funny',
  'Me vs The Algorithm (Trading Edition)',
  'Me: finally found the perfect entry ✅\nThe market: 😈',
  'Every trader has been here.\n\nYou do everything right. The chart says yes. Your gut says yes. Even your astrologer says yes.\n\nAnd then... expiry happens.\n\nStop trading vibes. Start trading the God Particle.\n\n🤣 Tag a trader who needs this\n📲 GodParticle.in — link in bio',
  ARRAY['#tradermemes', '#niftymemes', '#optionstrading', '#stockmarkethumor', '#tradingreels', '#sensex', '#relatable', '#godparticle', '#finfluencer', '#funnytrading'],
  'Dun Dun Dun - meme sound',
  'easy',
  '200K-1M'
),
(
  'behind_scenes',
  'How GodParticle Signal Fires on Expiry Day',
  'It''s 11:30 AM on Thursday. Watch what happens next 👀',
  'Every Thursday at 11:30 AM, 5 proprietary forces align.\n\nThe Zero-to-Hero engine scans the entire Sensex option chain.\n\nWhen all 5 forces fire — an email alert goes to every subscriber.\n\nNo human intervention. Pure algorithm.\n\nLast 3 signals: 180%, 240%, 320% in 45 minutes.\n\n📧 Get the next alert free — GodParticle.in\n\n⏰ Next expiry: Thursday. Be ready.',
  ARRAY['#expiryday', '#sensex', '#zerotoherostrategy', '#optionsignal', '#algorithmic', '#tradingalert', '#banknifty', '#godparticle', '#optionseller', '#bigmoves'],
  'Mission Impossible Theme - trending',
  'medium',
  '80K-300K'
),
(
  'testimonial',
  'What Happens When You Trade WITH Institutional Gravity',
  'Nobody believes me until they see it with their own eyes 📊',
  '"I''ve been trading for 6 years. I thought I knew everything.\n\nThen I found the God Particle.\n\nI finally understood WHY my strikes kept getting crushed. The institutions weren''t random — they had a gravitational center I was ignoring.\n\nNow I trade WITH the gravity. Game changer."\n\n— Premium subscriber\n\nReady to trade like an institution?\n🔗 GodParticle.in — link in bio',
  ARRAY['#tradingsuccess', '#optionstrading', '#godparticle', '#testimonial', '#stockmarket', '#nifty', '#traderlife', '#investindia', '#finfluencer', '#wealthbuilding'],
  'Emotional Piano - trending',
  'easy',
  '30K-150K'
),
(
  'trending_challenge',
  '"Tell Me You Trade Options Without Telling Me"',
  'Tell me you trade options without telling me you trade options 😂',
  'I''ll go first:\n\n"I check my phone 47 times between 9:15 and 11:30 AM"\n\n"My stop loss is hope"\n\n"I only buy OTM options 2 days before expiry"\n\n😭 Comment yours below!\n\nP.S. If you want to stop trading emotions and start trading signals — GodParticle.in',
  ARRAY['#optionstrading', '#tellmewithouttellingme', '#tradermemes', '#stockmarketmemes', '#nifty50', '#relatable', '#finfluencer', '#godparticle', '#investorindia', '#zerodha'],
  'Tell Me - trending audio',
  'easy',
  '500K-2M'
);

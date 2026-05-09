-- ═══════════════════════════════════════════════
--  AUTOMARKET — Core Schema
-- ═══════════════════════════════════════════════

create table if not exists am_content (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  idea_text     text not null,
  image_urls    text[]   default '{}',
  video_url     text,
  platform      text not null check (platform in ('instagram', 'youtube', 'both')),
  content_type  text not null check (content_type in ('reel', 'post', 'story', 'short', 'carousel')),
  tone          text not null default 'viral' check (tone in ('viral', 'educational', 'funny', 'inspirational', 'behind_scenes')),
  ai_hook        text,
  ai_caption     text,
  ai_hashtags    text[],
  ai_script      text,
  ai_cta         text,
  ai_generated_at timestamptz,
  final_caption  text,
  final_hashtags text[],
  status         text not null default 'draft'
                 check (status in ('draft','generating','awaiting_approval','approved','scheduled','posted','rejected','failed')),
  scheduled_at   timestamptz,
  posted_at      timestamptz,
  rejection_note text,
  ig_creation_id  text,
  ig_media_id     text,
  ig_permalink    text,
  ig_like_count   int,
  ig_comment_count int,
  ig_reach        int,
  yt_video_id     text,
  yt_url          text,
  yt_view_count   bigint,
  yt_like_count   int
);

create table if not exists am_automation_rules (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz default now(),
  name           text not null,
  platform       text not null check (platform in ('instagram', 'youtube', 'both')),
  trigger_type   text not null check (trigger_type in (
                   'comment_keyword', 'dm_keyword', 'new_follower',
                   'story_reply', 'post_tag', 'reel_share')),
  trigger_keywords text[],
  match_mode     text default 'any' check (match_mode in ('any', 'all', 'exact')),
  action_type    text not null check (action_type in (
                   'reply_comment', 'send_dm', 'follow_back',
                   'like_comment', 'send_link', 'tag_story')),
  action_message text,
  delay_seconds  int default 0,
  is_active      bool default true,
  trigger_count  int default 0,
  last_fired_at  timestamptz
);

create table if not exists am_automation_log (
  id          uuid primary key default gen_random_uuid(),
  fired_at    timestamptz default now(),
  rule_id     uuid references am_automation_rules(id) on delete cascade,
  platform    text,
  trigger_data jsonb,
  action_sent  text,
  success      bool,
  error_msg    text
);

create table if not exists am_accounts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  platform        text not null check (platform in ('instagram', 'youtube')),
  display_name    text,
  handle          text,
  platform_id     text,
  access_token    text,
  token_expires_at timestamptz,
  is_connected    bool default false,
  follower_count  int default 0,
  following_count int default 0,
  media_count     int default 0,
  last_synced_at  timestamptz
);

create table if not exists am_ideas (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz default now(),
  category         text not null,
  difficulty       text check (difficulty in ('easy', 'medium', 'hard')),
  estimated_reach  text,
  title            text not null,
  hook_template    text,
  caption_template text,
  hashtag_pack     text[],
  trending_audio   text,
  best_time        text,
  is_active        bool default true
);

create table if not exists am_analytics_snapshots (
  id            uuid primary key default gen_random_uuid(),
  snapped_at    timestamptz default now(),
  platform      text,
  followers     int,
  following     int,
  media_count   int,
  reach_7d      int,
  impressions_7d int,
  profile_views_7d int,
  top_post_id   text,
  top_post_reach int
);

insert into am_ideas (category, difficulty, estimated_reach, title, hook_template, caption_template, hashtag_pack, trending_audio, best_time) values

('viral_hook', 'easy', '50K–200K',
 'The Number Institutions Never Want You to Know',
 'POV: You just discovered the number that institutions NEVER want retail traders to see 👀',
 E'Retail traders lose because they play the game without knowing the score.\n\nThis ONE number — the God Particle — is the gravitational center of every option position institutions write.\n\nWhen you know it, the market stops feeling random.\n\n📊 Find it free → GodParticle.in\n\n💬 Comment "PARTICLE" and I''ll DM you how to use it tomorrow.',
 ARRAY['#optionstrading','#nifty','#sensex','#tradingtips','#stockmarket','#banknifty','#retailtrader','#godparticle','#tradingsecretsrevealed','#expiryday'],
 'Astronaut In The Ocean', '7–9 PM IST'),

('meme_funny', 'easy', '200K–1M',
 'Me vs The Market (Every Expiry)',
 'Me: perfect entry, perfect timing ✅  The market on Thursday: 😈',
 E'Every. Single. Expiry.\n\nYou do EVERYTHING right.\nChart says yes.\nGut says yes.\nYour uncle who also trades says yes.\n\nAnd then... IV crush happens.\n\n😭 Stop trading vibes. Start trading the God Particle.\n\n🔗 GodParticle.in — link in bio\n\n🤣 Tag the trader friend who needs this',
 ARRAY['#tradermemes','#niftymemes','#optionstrading','#stockmarkethumor','#tradingreels','#sensex','#relatable','#godparticle','#finfluencer','#zerodha'],
 'Dun Dun Dun meme sound', '12 PM or 8 PM IST'),

('educational', 'medium', '100K–500K',
 'Why You Were Right About Direction but Still Lost Money',
 'You predicted the move correctly. You still lost money. Here''s why 👇',
 E'This happens to 90% of option buyers.\n\nYou called the direction right.\nNifty moved exactly where you thought.\nYour option still went to zero.\n\nThe reason: IV crush + theta decay hit before your move.\n\nThe fix: Know the God Particle — the institutional cost basis — BEFORE you enter.\n\n📌 Try it free → GodParticle.in\n\n🔁 Share with a trader who needs to see this',
 ARRAY['#optionbuying','#ivcrush','#thetadecay','#whytraderslose','#nifty50','#stockmarket','#tradingeducation','#godparticle','#financialeducation','#optionsselling'],
 'Sad Piano meme sound', '6–8 PM IST'),

('behind_scenes', 'medium', '80K–300K',
 'Watch the Zero-to-Hero Signal Fire Live',
 'It''s 11:30 AM Thursday. 5 forces just aligned. Watch what happens next 👀',
 E'Every Thursday at 11:30 AM, our algorithm scans the entire Sensex option chain.\n\n5 proprietary forces analysed simultaneously.\n\nWhen ALL 5 align → email alert fires to every subscriber.\n\nZero human intervention. Pure algorithm.\n\nLast 3 signals:\n✅ +180% in 47 min\n✅ +240% in 31 min\n✅ +320% in 52 min\n\n📧 Get the next alert free — GodParticle.in\n⏰ Next expiry: Thursday.',
 ARRAY['#expiryday','#sensex','#zerotoherostrategy','#optionsignal','#algorithmictrading','#tradingalert','#banknifty','#godparticle','#optionsselling','#bigmoves'],
 'Mission Impossible theme', '10–11 AM IST'),

('trending_challenge', 'easy', '500K–2M',
 'Tell Me You Trade Options Without Telling Me',
 'Tell me you trade options without telling me you trade options 🙃',
 E'I''ll go first:\n\n📱 "I check my phone every 3 minutes between 9:15 and 3:30"\n💀 "My stop loss is hope"\n🎰 "I buy OTM options 2 days before expiry"\n😤 "I averaged down 4 times"\n\nComment yours 👇👇👇\n\nP.S. If you''re done trading emotions — GodParticle.in',
 ARRAY['#optionstrading','#tellmewithouttellingme','#tradermemes','#stockmarketmemes','#nifty50','#relatable','#finfluencer','#godparticle','#investorindia','#zerodha'],
 'Tell Me - trending', '7–9 PM IST'),

('testimonial', 'easy', '30K–150K',
 'What Happens When You Trade WITH Institutional Gravity',
 'Nobody believes me until they see the chart themselves 📊',
 E'"I''ve been trading for 6 years. I thought I''d seen everything.\n\nThen I found the God Particle.\n\nI finally understood WHY my strikes kept getting crushed — institutions had a gravitational center I was completely ignoring.\n\nNow I trade WITH the gravity, not against it."\n\n— Premium subscriber\n\nWant to trade like an institution?\n🔗 GodParticle.in — link in bio',
 ARRAY['#tradingsuccess','#optionstrading','#godparticle','#testimonial','#stockmarket','#nifty','#traderlife','#investindia','#finfluencer','#wealthbuilding'],
 'Emotional Piano', '6–8 PM IST');

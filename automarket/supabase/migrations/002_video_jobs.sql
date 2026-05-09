-- Video generation job tracking

create type video_job_status as enum (
  'queued',
  'generating_voice',
  'rendering_video',
  'merging_audio',
  'generating_subtitles',
  'burning_subtitles',
  'uploading',
  'done',
  'failed'
);

create table if not exists am_video_jobs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  content_id      uuid references am_content(id) on delete cascade,
  voice_id        text not null default 'pNInz6obpgDQGcFmaJgB',
  bg_music        text,
  subtitle_style  text default 'bold',
  aspect_ratio    text default '9:16',
  status          video_job_status not null default 'queued',
  progress        int default 0,
  current_step    text,
  audio_url       text,
  raw_video_url   text,
  subtitles_url   text,
  final_video_url text,
  duration_seconds float,
  file_size_bytes  bigint,
  error_msg        text,
  completed_at    timestamptz
);

create table if not exists am_video_subtitles (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references am_video_jobs(id) on delete cascade,
  word_index  int not null,
  word        text not null,
  start_time  float not null,
  end_time    float not null
);

create index on am_video_jobs(content_id);
create index on am_video_subtitles(job_id);

alter table am_content add column if not exists video_url text;

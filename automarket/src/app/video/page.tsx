'use client';
import { useEffect, useState, useRef } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import type { AmContent } from '@/lib/supabase';

interface VideoJob {
  id: string; status: string; progress: number; current_step: string | null;
  audio_url: string | null; raw_video_url: string | null; subtitles_url: string | null;
  final_video_url: string | null; duration_seconds: number | null;
  file_size_bytes: number | null; error_msg: string | null; completed_at: string | null;
}

const VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam',    flag: '🇺🇸', note: 'Deep, professional male' },
  { id: 'gieo6kfnl9oBGiaBnreN', label: 'Rishi',   flag: '🇮🇳', note: 'Indian English, authoritative' },
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel',  flag: '🇺🇸', note: 'Warm, engaging female' },
  { id: 'ThT5KcBeYPX3keUQqHPh', label: 'Priya',   flag: '🇮🇳', note: 'Indian English, friendly female' },
  { id: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie', flag: '🇬🇧', note: 'Crisp British male' },
];

const BG_MUSIC = [
  { value: 'none',     label: 'No Music',  emoji: '🔇' },
  { value: 'subtle',   label: 'Subtle',    emoji: '🎵', note: 'Soft ambient, 8% volume' },
  { value: 'upbeat',   label: 'Upbeat',    emoji: '🎶', note: 'Energetic, 8% volume' },
  { value: 'dramatic', label: 'Dramatic',  emoji: '🎼', note: 'Epic, cinematic, 8% volume' },
];

const SUBTITLE_STYLES = [
  { value: 'bold',      label: 'Bold White',    emoji: '💬', note: 'Large white text, black outline' },
  { value: 'highlight', label: 'Gold Highlight', emoji: '✨', note: 'Gold text, purple outline' },
  { value: 'minimal',   label: 'Minimal',       emoji: '🪶', note: 'Clean, small, no outline' },
];

const STATUS_STEPS = [
  { key: 'queued',               label: 'Queued',               pct: 0   },
  { key: 'generating_voice',     label: '🎤 Generating voice',  pct: 10  },
  { key: 'rendering_video',      label: '🎬 Rendering video',   pct: 35  },
  { key: 'merging_audio',        label: '🔊 Merging audio',     pct: 65  },
  { key: 'generating_subtitles', label: '💬 Building subtitles',pct: 72  },
  { key: 'burning_subtitles',    label: '🔥 Burning subtitles', pct: 80  },
  { key: 'uploading',            label: '☁️ Uploading',         pct: 93  },
  { key: 'done',                 label: '✅ Done!',              pct: 100 },
];

export default function VideoPage() {
  const [approvedContent, setApprovedContent] = useState<AmContent[]>([]);
  const [selected, setSelected]   = useState<AmContent | null>(null);
  const [voiceId, setVoiceId]     = useState(VOICES[0].id);
  const [bgMusic, setBgMusic]     = useState('none');
  const [subStyle, setSubStyle]   = useState('bold');
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId]         = useState<string | null>(null);
  const [job, setJob]             = useState<VideoJob | null>(null);
  const [pastJobs, setPastJobs]   = useState<(VideoJob & { content_id: string })[]>([]);
  const [error, setError]         = useState('');
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { loadApprovedContent(); loadPastJobs(); }, []);

  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      const res  = await fetch(`/api/video/status/${jobId}`);
      const data = await res.json() as VideoJob;
      setJob(data);
      if (data.status === 'done' || data.status === 'failed') {
        clearInterval(pollRef.current!);
        loadPastJobs();
      }
    }, 2500);
    return () => clearInterval(pollRef.current!);
  }, [jobId]);

  async function loadApprovedContent() {
    const { data } = await supabase.from('am_content').select('*').in('status', ['approved','scheduled','posted']).order('created_at', { ascending: false }).limit(20);
    setApprovedContent((data ?? []) as AmContent[]);
  }

  async function loadPastJobs() {
    const { data } = await supabase.from('am_video_jobs').select('*').order('created_at', { ascending: false }).limit(10);
    setPastJobs((data ?? []) as (VideoJob & { content_id: string })[]);
  }

  async function handleGenerate() {
    if (!selected) { setError('Pick a content item first'); return; }
    setError('');
    setGenerating(true);
    setJob(null);
    const res  = await fetch('/api/video/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contentId: selected.id, voiceId, bgMusic, subtitleStyle: subStyle }),
    });
    const data = await res.json() as { jobId?: string; error?: string };
    setGenerating(false);
    if (!res.ok || data.error) { setError(data.error ?? 'Failed to start'); return; }
    setJobId(data.jobId!);
  }

  const activeStepIdx = STATUS_STEPS.findIndex(s => s.key === job?.status);

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#f1f5f9]">🎬 Video Generator</h1>
          <p className="text-[#64748b] text-sm mt-1">Turn approved content into fully edited Reels — voice, subtitles, and all</p>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-[#ef444422] border border-[#ef444444] text-sm text-[#f87171]">
            {error} <button onClick={() => setError('')} className="ml-3 text-[#64748b]">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-5">
            <div>
              <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">Select Content</label>
              <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                {approvedContent.length === 0 ? (
                  <p className="text-xs text-[#64748b] py-4 text-center">No approved content yet</p>
                ) : approvedContent.map(item => (
                  <button key={item.id} onClick={() => setSelected(item)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all
                      ${selected?.id === item.id ? 'border-[#7c3aed] bg-[#7c3aed22]' : 'border-[#1e1e2e] hover:border-[#ffffff18]'}`}>
                    {item.image_urls?.[0]
                      ? <img src={item.image_urls[0]} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-lg bg-[#1e1e2e] flex items-center justify-center text-lg flex-shrink-0">📸</div>
                    }
                    <div className="min-w-0">
                      <div className={`text-xs font-bold truncate ${selected?.id === item.id ? 'text-[#a78bfa]' : 'text-[#f1f5f9]'}`}>{item.ai_hook ?? item.idea_text}</div>
                      <div className="text-[10px] text-[#64748b] capitalize">{item.platform} · {item.content_type}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">🎤 Narrator Voice</label>
              <div className="flex flex-col gap-1.5">
                {VOICES.map(v => (
                  <button key={v.id} onClick={() => setVoiceId(v.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all
                      ${voiceId === v.id ? 'border-[#7c3aed] bg-[#7c3aed22]' : 'border-[#1e1e2e] hover:border-[#ffffff18]'}`}>
                    <span className="text-base">{v.flag}</span>
                    <div>
                      <div className={`text-xs font-bold ${voiceId === v.id ? 'text-[#a78bfa]' : 'text-[#f1f5f9]'}`}>{v.label}</div>
                      <div className="text-[10px] text-[#64748b]">{v.note}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">💬 Subtitle Style</label>
              <div className="flex gap-2">
                {SUBTITLE_STYLES.map(s => (
                  <button key={s.value} onClick={() => setSubStyle(s.value)}
                    className={`flex-1 py-3 px-2 rounded-xl border transition-all text-center
                      ${subStyle === s.value ? 'border-[#7c3aed] bg-[#7c3aed22]' : 'border-[#1e1e2e] hover:border-[#ffffff18]'}`}>
                    <div className="text-xl mb-1">{s.emoji}</div>
                    <div className={`text-[10px] font-bold ${subStyle === s.value ? 'text-[#a78bfa]' : 'text-[#f1f5f9]'}`}>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">🎵 Background Music</label>
              <div className="grid grid-cols-2 gap-2">
                {BG_MUSIC.map(m => (
                  <button key={m.value} onClick={() => setBgMusic(m.value)}
                    className={`py-2.5 px-3 rounded-xl border text-left transition-all
                      ${bgMusic === m.value ? 'border-[#7c3aed] bg-[#7c3aed22]' : 'border-[#1e1e2e] hover:border-[#ffffff18]'}`}>
                    <span className="text-lg mr-2">{m.emoji}</span>
                    <span className={`text-xs font-bold ${bgMusic === m.value ? 'text-[#a78bfa]' : 'text-[#f1f5f9]'}`}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleGenerate}
              disabled={!selected || generating || (!!job && !['done','failed'].includes(job.status))}
              className="btn-primary w-full py-4 text-sm font-black flex items-center justify-center gap-2 mt-auto">
              {generating ? <><span className="spinner" /> Starting...</> : <>🚀 Generate Video</>}
            </button>
          </div>

          <div className="flex flex-col gap-5">
            {job && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="font-black text-[#f1f5f9] text-sm">
                    {job.status === 'done' ? '✅ Video Ready!' : job.status === 'failed' ? '❌ Failed' : '⚙️ Processing...'}
                  </div>
                  <div className="text-xs font-bold text-[#a78bfa]">{job.progress}%</div>
                </div>
                <div className="w-full h-2 rounded-full bg-[#1e1e2e] mb-4 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${job.progress}%`, background: job.status === 'done' ? '#10b981' : job.status === 'failed' ? '#ef4444' : 'linear-gradient(90deg, #7c3aed, #f059da)' }} />
                </div>
                <div className="flex flex-col gap-2 mb-4">
                  {STATUS_STEPS.filter(s => s.key !== 'queued').map((step, i) => {
                    const stepIdx = STATUS_STEPS.findIndex(s => s.key === step.key);
                    const done    = activeStepIdx > stepIdx || job.status === 'done';
                    const active  = step.key === job.status;
                    return (
                      <div key={step.key} className={`flex items-center gap-2 text-xs ${done ? 'text-[#34d399]' : active ? 'text-[#a78bfa]' : 'text-[#3f3f5a]'}`}>
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] flex-shrink-0
                          ${done ? 'bg-[#10b98133]' : active ? 'bg-[#7c3aed33]' : 'bg-[#1e1e2e]'}`}>
                          {done ? '✓' : active ? <span className="spinner" style={{ width: 8, height: 8 }} /> : i + 1}
                        </div>
                        {step.label}
                      </div>
                    );
                  })}
                </div>
                {job.current_step && <p className="text-xs text-[#64748b] italic mb-3">{job.current_step}</p>}
                {job.status === 'failed' && job.error_msg && (
                  <div className="bg-[#ef444411] border border-[#ef444433] rounded-xl p-3 text-xs text-[#f87171] mb-3">{job.error_msg}</div>
                )}
                {job.status === 'done' && job.final_video_url && (
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3 text-xs text-[#64748b]">
                      {job.duration_seconds && <span>⏱ {job.duration_seconds.toFixed(1)}s</span>}
                      {job.file_size_bytes  && <span>📦 {(job.file_size_bytes / 1024 / 1024).toFixed(1)} MB</span>}
                    </div>
                    <video src={job.final_video_url} controls className="w-full rounded-xl border border-[#1e1e2e]" style={{ maxHeight: 400 }} />
                    <div className="flex gap-2">
                      <a href={job.final_video_url} download className="flex-1 btn-primary py-2.5 text-xs text-center flex items-center justify-center gap-1">⬇️ Download</a>
                      {job.subtitles_url && <a href={job.subtitles_url} download className="px-4 py-2.5 rounded-xl border border-[#1e1e2e] text-xs text-[#64748b] hover:text-[#f1f5f9] text-center">💬 SRT</a>}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!job && (
              <div className="card border-[#7c3aed22]">
                <div className="text-sm font-black text-[#f1f5f9] mb-4">What gets generated</div>
                {[
                  { icon: '🎤', title: 'AI Voiceover', desc: 'ElevenLabs TTS reads your script' },
                  { icon: '🎬', title: 'Animated Video', desc: 'Photos + animated text slides with Ken Burns effect' },
                  { icon: '💬', title: 'Word-level Subtitles', desc: 'CapCut-style subs synced to every word' },
                  { icon: '🔥', title: 'Burned-in Subs', desc: 'Subtitles permanently embedded' },
                  { icon: '📦', title: 'Optimised MP4', desc: 'Fast-start 1080×1920 H.264, ready to upload' },
                ].map(item => (
                  <div key={item.title} className="flex items-start gap-3 py-2.5 border-b border-[#1e1e2e] last:border-0">
                    <span className="text-xl flex-shrink-0">{item.icon}</span>
                    <div>
                      <div className="text-xs font-bold text-[#f1f5f9]">{item.title}</div>
                      <div className="text-[10px] text-[#64748b] mt-0.5">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

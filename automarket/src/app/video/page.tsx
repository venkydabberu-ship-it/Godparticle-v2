'use client';
import { useState } from 'react';
import AppShell from '@/components/AppShell';

const VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam', lang: 'English (US)', gender: '👨' },
  { id: 'gieo6kfnl9oBGiaBnreN', label: 'Rishi', lang: 'English (Indian)', gender: '👨' },
  { id: 'ThT5KcBeYPX3keUQqHPh', label: 'Priya', lang: 'English (Indian)', gender: '👩' },
  { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel', lang: 'English (US)', gender: '👩' },
];

type Status = 'idle'|'running'|'done'|'error';

export default function VideoGen() {
  const [contentId, setContentId]   = useState('');
  const [voiceId, setVoiceId]       = useState(VOICES[1].id);
  const [status, setStatus]         = useState<Status>('idle');
  const [progress, setProgress]     = useState(0);
  const [step, setStep]             = useState('');
  const [videoUrl, setVideoUrl]     = useState('');
  const [jobId, setJobId]           = useState('');
  const [error, setError]           = useState('');

  async function handleGenerate() {
    if (!contentId.trim()) { setError('Paste your content ID first'); return; }
    setError('');
    setStatus('running');
    setProgress(5);
    setStep('Starting...');

    // Poll for progress while the generate API runs
    let pollDone = false;
    let pollJobId = '';

    // We'll update progress optimistically while waiting
    const ticker = setInterval(() => {
      if (pollDone) { clearInterval(ticker); return; }
      setProgress(p => Math.min(p + 2, 88));
    }, 1200);

    const steps = ['Preparing content...','Generating voiceover...','Creating slides...','Encoding video...','Uploading reel...'];
    let si = 0;
    const stepTicker = setInterval(() => {
      if (pollDone) { clearInterval(stepTicker); return; }
      setStep(steps[si % steps.length]);
      si++;
    }, 7000);

    try {
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId: contentId.trim(), voiceId }),
      });
      pollDone = true;
      clearInterval(ticker);
      clearInterval(stepTicker);

      const json = await res.json() as { success?: boolean; jobId?: string; job?: { final_video_url?: string; error_msg?: string }; error?: string };

      if (!res.ok || json.error) {
        setError(json.error ?? 'Generation failed');
        setStatus('error');
        return;
      }

      if (json.job?.final_video_url) {
        setVideoUrl(json.job.final_video_url);
        setJobId(json.jobId ?? '');
        setProgress(100);
        setStep('Your reel is ready! 🎉');
        setStatus('done');
      } else {
        setError(json.job?.error_msg ?? 'Video generation failed');
        setStatus('error');
      }
    } catch (e) {
      pollDone = true;
      clearInterval(ticker);
      clearInterval(stepTicker);
      setError(String(e));
      setStatus('error');
    }
  }

  return (
    <AppShell>
      <div className="p-8 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#f1f5f9]">🎬 Reel Generator</h1>
          <p className="text-[#64748b] text-sm mt-1">
            Turn your approved content into a downloadable Instagram Reel
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-[#ef444422] border border-[#ef444444] text-sm text-[#f87171]">{error}</div>
        )}

        {status === 'idle' || status === 'error' ? (
          <div className="flex flex-col gap-5">
            {/* Content ID */}
            <div className="card">
              <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">
                Content ID
              </label>
              <input
                value={contentId}
                onChange={e => setContentId(e.target.value)}
                placeholder="Paste the content UUID from the Queue page..."
                className="w-full bg-[#111118] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] placeholder-[#3f3f5a] focus:outline-none focus:border-[#7c3aed66]"
              />
              <p className="text-[10px] text-[#64748b] mt-1.5">
                Go to Queue → click on any approved item → copy the ID from the URL
              </p>
            </div>

            {/* Voice selection */}
            <div className="card">
              <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-3 block">
                AI Voice {!process.env.NEXT_PUBLIC_ELEVENLABS_ENABLED && <span className="text-[#64748b] normal-case font-normal">(add ELEVENLABS_API_KEY for voice)</span>}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {VOICES.map(v => (
                  <button key={v.id} onClick={() => setVoiceId(v.id)}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl border text-left transition-all
                      ${voiceId === v.id ? 'border-[#7c3aed] bg-[#7c3aed22]' : 'border-[#1e1e2e] hover:border-[#ffffff18]'}`}>
                    <span className="text-xl">{v.gender}</span>
                    <div>
                      <div className={`text-xs font-bold ${voiceId === v.id ? 'text-[#a78bfa]' : 'text-[#f1f5f9]'}`}>{v.label}</div>
                      <div className="text-[10px] text-[#64748b]">{v.lang}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={handleGenerate} className="btn-primary w-full py-4 text-sm font-bold">
              🎬 Generate Reel (takes ~40 seconds)
            </button>
          </div>
        ) : status === 'running' ? (
          <div className="card flex flex-col items-center py-16 gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#f059da)' }}>🎬</div>
              <div className="absolute -bottom-1 -right-1 spinner" />
            </div>
            <div className="text-center">
              <div className="font-black text-[#f1f5f9] text-lg mb-1">Creating your reel...</div>
              <div className="text-[#64748b] text-sm">{step}</div>
            </div>
            <div className="w-full max-w-sm">
              <div className="flex justify-between text-xs text-[#64748b] mb-1.5">
                <span>Progress</span><span>{progress}%</span>
              </div>
              <div className="w-full bg-[#1e1e2e] rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#7c3aed,#f059da)' }}
                />
              </div>
            </div>
            <p className="text-xs text-[#64748b] text-center max-w-xs">
              AI is generating slides + voiceover + encoding the 9:16 reel.<br/>
              This takes 30-60 seconds. Don't close the page.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="card flex flex-col items-center py-12 gap-4">
              <div className="text-5xl">🎉</div>
              <div className="text-center">
                <div className="font-black text-[#f1f5f9] text-xl mb-1">Reel is ready!</div>
                <div className="text-[#64748b] text-sm">Download and post it to Instagram</div>
              </div>
              <a href={videoUrl} download="reel.mp4" target="_blank" rel="noreferrer"
                className="btn-primary px-8 py-3 text-sm font-bold flex items-center gap-2">
                ⬇️ Download Reel (MP4)
              </a>
              {videoUrl && (
                <video src={videoUrl} controls className="rounded-xl max-h-96 mt-2" />
              )}
            </div>
            <button
              onClick={() => { setStatus('idle'); setProgress(0); setStep(''); setVideoUrl(''); setError(''); }}
              className="py-3 rounded-xl border border-[#1e1e2e] text-sm text-[#64748b] hover:border-[#ffffff18] hover:text-[#f1f5f9] transition-all font-bold">
              ← Generate Another Reel
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import type { AmIdea } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

const CATEGORIES = [
  { value: 'all',             label: 'All Ideas',        emoji: '💡' },
  { value: 'viral_hook',      label: 'Viral Hook',       emoji: '🔥' },
  { value: 'meme_funny',      label: 'Meme / Funny',     emoji: '😂' },
  { value: 'educational',     label: 'Educational',      emoji: '📚' },
  { value: 'behind_scenes',   label: 'Behind the Scenes',emoji: '👀' },
  { value: 'testimonial',     label: 'Testimonial',      emoji: '💬' },
  { value: 'trending_challenge', label: 'Trending',      emoji: '📈' },
];

const DIFFICULTY_COLOR: Record<string, string> = {
  easy: '#10b981', medium: '#f59e0b', hard: '#ef4444',
};

const HASHTAG_PACKS = [
  { name: 'Expiry Day Pack', tags: ['#expiryday','#nifty50','#sensex','#banknifty','#optionsselling','#ivcrush','#zerotoherostrategy','#godparticle','#algorithmic','#optionsignal'], desc: 'Use on Tuesdays & Thursdays' },
  { name: 'Reach Maximizer', tags: ['#stockmarket','#sharemarket','#trading','#nse','#bse','#zerodha','#groww','#angelbroking','#investindia','#retailtrader'], desc: 'High-volume discovery tags' },
  { name: 'Finance Finfluencer', tags: ['#finfluencer','#financialeducation','#moneymindset','#wealthbuilding','#passiveincome','#investingforbeginners','#stockmarketeducation','#tradingmindset','#moneygoals','#wealthmindset'], desc: 'Build authority & trust' },
  { name: 'Meme & Viral', tags: ['#tradermemes','#stockmarketmemes','#tradinghumor','#niftymemes','#relatable','#funnytrading','#optionbuyer','#retailinvestor','#markethumor','#expirymemes'], desc: 'Maximize shares & saves' },
];

const BEST_TIMES = [
  { time: '7:00 AM', note: 'Pre-market traders checking charts', icon: '🌅' },
  { time: '11:30 AM', note: 'Mid-session break — high traffic', icon: '📊' },
  { time: '3:30 PM', note: 'Market close euphoria/pain', icon: '🔔' },
  { time: '7:00–9:00 PM', note: '★ Best slot — traders relaxing', icon: '⭐' },
  { time: '10:00 PM', note: 'Night owls planning tomorrow', icon: '🌙' },
];

export default function IdeasBank() {
  const router = useRouter();
  const [ideas, setIdeas]   = useState<AmIdea[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { loadIdeas(); }, []);

  async function loadIdeas() {
    setLoading(true);
    const { data } = await supabase.from('am_ideas').select('*').eq('is_active', true).order('created_at');
    setIdeas((data ?? []) as AmIdea[]);
    setLoading(false);
  }

  function useIdea(idea: AmIdea) {
    const params = new URLSearchParams({
      idea: idea.hook_template ?? idea.title,
      tone: idea.category === 'meme_funny' ? 'funny' : idea.category === 'educational' ? 'educational' : idea.category === 'behind_scenes' ? 'behind_scenes' : 'viral',
    });
    router.push(`/studio?${params.toString()}`);
  }

  function copyTags(tags: string[], packName: string) {
    navigator.clipboard.writeText(tags.join(' '));
    setCopied(packName);
    setTimeout(() => setCopied(null), 2000);
  }

  const filtered = filter === 'all' ? ideas : ideas.filter(i => i.category === filter);

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#f1f5f9]">💡 Viral Ideas Bank</h1>
          <p className="text-[#64748b] text-sm mt-1">Proven content templates for the Indian trading niche.</p>
        </div>

        <div className="flex gap-2 mb-6 flex-wrap">
          {CATEGORIES.map(cat => (
            <button key={cat.value} onClick={() => setFilter(cat.value)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all
                ${filter === cat.value ? 'bg-[#7c3aed22] border border-[#7c3aed44] text-[#a78bfa]' : 'border border-[#1e1e2e] text-[#64748b] hover:border-[#ffffff18] hover:text-[#f1f5f9]'}`}>
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-[#64748b] py-8"><span className="spinner" /> Loading...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
            {filtered.map(idea => <IdeaCard key={idea.id} idea={idea} onUse={() => useIdea(idea)} />)}
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-lg font-black text-[#f1f5f9] mb-4">#️⃣ Hashtag Packs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {HASHTAG_PACKS.map(pack => (
              <div key={pack.name} className="card hover:border-[#ffffff10] transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div><div className="font-bold text-sm text-[#f1f5f9]">{pack.name}</div><div className="text-xs text-[#64748b]">{pack.desc}</div></div>
                  <button onClick={() => copyTags(pack.tags, pack.name)}
                    className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-all flex-shrink-0
                      ${copied === pack.name ? 'bg-[#10b98122] text-[#34d399]' : 'bg-[#7c3aed22] text-[#a78bfa] hover:bg-[#7c3aed33]'}`}>
                    {copied === pack.name ? '✓ Copied!' : '📋 Copy All'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1 mt-3">
                  {pack.tags.map((tag, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1e1e2e] text-[#64748b] font-mono">{tag}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-black text-[#f1f5f9] mb-4">⏰ Best Times to Post (IST)</h2>
          <div className="card">
            <div className="flex flex-col gap-3">
              {BEST_TIMES.map((t, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-[#1e1e2e] last:border-0">
                  <span className="text-xl">{t.icon}</span>
                  <div className="font-bold text-sm text-[#f1f5f9] w-36 flex-shrink-0">{t.time}</div>
                  <div className="text-xs text-[#64748b]">{t.note}</div>
                  {t.time.includes('7:00–9') && <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[#f59e0b22] text-[#fbbf24] font-bold flex-shrink-0">Best</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function IdeaCard({ idea, onUse }: { idea: AmIdea; onUse: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const diffColor = DIFFICULTY_COLOR[idea.difficulty ?? 'easy'];
  return (
    <div className="card hover:border-[#ffffff10] transition-colors flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1">
          <div className="font-black text-sm text-[#f1f5f9] mb-1">{idea.title}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold capitalize" style={{ background: `${diffColor}22`, color: diffColor }}>{idea.difficulty}</span>
            <span className="text-[10px] text-[#64748b]">📊 {idea.estimated_reach} views</span>
          </div>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="text-[#64748b] hover:text-[#f1f5f9] text-sm flex-shrink-0">{expanded ? '▲' : '▼'}</button>
      </div>
      {idea.hook_template && (
        <div className="bg-[#7c3aed11] border border-[#7c3aed33] rounded-xl p-3 mb-3">
          <div className="text-[10px] font-bold text-[#7c3aed] mb-1 uppercase tracking-wider">Hook</div>
          <p className="text-xs text-[#a78bfa] italic leading-relaxed">"{idea.hook_template}"</p>
        </div>
      )}
      {expanded && idea.hashtag_pack?.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-1">Hashtags</div>
          <div className="flex flex-wrap gap-1">
            {idea.hashtag_pack.map((h, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#7c3aed22] text-[#a78bfa] font-mono">{h}</span>)}
          </div>
        </div>
      )}
      <div className="mt-auto"><button onClick={onUse} className="btn-primary w-full py-2.5 text-xs">🎬 Use This Template in Studio</button></div>
    </div>
  );
}

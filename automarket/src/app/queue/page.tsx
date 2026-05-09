'use client';
import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import type { AmContent, ContentStatus } from '@/lib/supabase';

const TABS: { value: ContentStatus|'all'; label: string; emoji: string }[] = [
  {value:'all',label:'All',emoji:'📋'},{value:'awaiting_approval',label:'To Review',emoji:'⏳'},
  {value:'approved',label:'Approved',emoji:'✅'},{value:'scheduled',label:'Scheduled',emoji:'📅'},
  {value:'posted',label:'Live',emoji:'🟢'},{value:'rejected',label:'Rejected',emoji:'❌'},
];
const SL: Record<string,string> = { draft:'Draft', generating:'Generating', awaiting_approval:'Needs Review', approved:'Approved', scheduled:'Scheduled', posted:'Posted ✓', rejected:'Rejected', failed:'Failed' };

export default function Queue() {
  const [items, setItems] = useState<AmContent[]>([]);
  const [filter, setFilter] = useState<ContentStatus|'all'>('all');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AmContent|null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [posting, setPosting] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('am_content').select('*').order('created_at',{ascending:false});
    if (filter!=='all') q = q.eq('status',filter);
    const {data} = await q;
    setItems((data??[]) as AmContent[]);
    setLoading(false);
  },[filter]);

  useEffect(()=>{load();},[load]);

  async function handleApprove(id: string) { await supabase.from('am_content').update({status:'approved'}).eq('id',id); setMsg('✅ Approved!'); load(); }
  async function handleReject(id: string) { await supabase.from('am_content').update({status:'rejected',rejection_note:'Does not meet standards'}).eq('id',id); setMsg('Rejected.'); load(); }
  async function handlePost(item: AmContent, schedule?: string) {
    setPosting(true);
    const res = await fetch('/api/instagram/post',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contentId:item.id,scheduleAt:schedule})});
    const json = await res.json() as {posted?:boolean;scheduled?:boolean;error?:string};
    if (json.error) setMsg(`Error: ${json.error}`);
    else if (json.scheduled) setMsg(`📅 Scheduled for ${schedule}`);
    else setMsg('🚀 Posted successfully!');
    setPosting(false); setSelected(null); load();
  }

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        <div className="mb-6"><h1 className="text-2xl font-black text-[#f1f5f9]">📋 Content Queue</h1><p className="text-[#64748b] text-sm mt-1">Review, approve, schedule, and post your AI-generated content</p></div>
        {msg&&<div className="mb-4 px-4 py-3 rounded-xl bg-[#10b98122] border border-[#10b98144] text-sm text-[#34d399] font-medium">{msg}<button onClick={()=>setMsg('')} className="ml-3 text-[#64748b]">✕</button></div>}
        <div className="flex gap-2 mb-6 flex-wrap">
          {TABS.map(tab=>(<button key={tab.value} onClick={()=>setFilter(tab.value)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${filter===tab.value?'bg-[#7c3aed22] border border-[#7c3aed44] text-[#a78bfa]':'border border-[#1e1e2e] text-[#64748b] hover:border-[#ffffff18] hover:text-[#f1f5f9]'}`}>{tab.emoji} {tab.label} <span className="text-[10px] opacity-60">({items.filter(i=>tab.value==='all'||i.status===tab.value).length})</span></button>))}
        </div>
        {loading?(<div className="flex items-center gap-2 text-[#64748b] py-8"><span className="spinner" /> Loading...</div>):items.length===0?(
          <div className="card text-center py-12"><div className="text-4xl mb-3">📭</div><div className="text-[#f1f5f9] font-bold mb-1">Queue is empty</div></div>
        ):(
          <div className="flex flex-col gap-3">{items.map(item=>(<QueueCard key={item.id} item={item} onApprove={()=>handleApprove(item.id)} onReject={()=>handleReject(item.id)} onPostNow={()=>handlePost(item)} onSchedule={()=>setSelected(item)} />))}</div>
        )}
        {selected&&(
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="card w-full max-w-sm border-[#7c3aed44]">
              <h3 className="font-black text-[#f1f5f9] mb-4">📅 Schedule Post</h3>
              <input type="datetime-local" value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)} className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] focus:outline-none focus:border-[#7c3aed66] mb-4" />
              <div className="text-xs text-[#64748b] mb-4">Best times: 7–9 PM IST (weekdays)</div>
              <div className="flex gap-2">
                <button onClick={()=>setSelected(null)} className="flex-1 py-2.5 rounded-xl border border-[#1e1e2e] text-sm text-[#64748b]">Cancel</button>
                <button onClick={()=>scheduleAt&&handlePost(selected,new Date(scheduleAt).toISOString())} disabled={!scheduleAt||posting} className="flex-[2] btn-primary py-2.5 text-sm flex items-center justify-center gap-2">{posting?<span className="spinner" />:'📅'} Schedule</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function QueueCard({item,onApprove,onReject,onPostNow,onSchedule}:{item:AmContent;onApprove:()=>void;onReject:()=>void;onPostNow:()=>void;onSchedule:()=>void}) {
  const [expanded,setExpanded] = useState(false);
  const date = new Date(item.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  return (
    <div className="card hover:border-[#ffffff10] transition-colors">
      <div className="flex items-start gap-3">
        {item.image_urls?.[0]?(<img src={item.image_urls[0]} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />):(<div className="w-14 h-14 rounded-xl bg-[#1e1e2e] flex items-center justify-center text-2xl flex-shrink-0">{item.platform==='youtube'?'▶️':'📸'}</div>)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold badge-${item.status}`}>{SL[item.status]}</span>
            <span className="text-xs text-[#64748b] bg-[#1e1e2e] px-2 py-0.5 rounded-full capitalize">{item.platform}</span>
            <span className="text-xs text-[#64748b] bg-[#1e1e2e] px-2 py-0.5 rounded-full capitalize">{item.content_type}</span>
            <span className="text-xs text-[#3f3f5a] ml-auto">{date}</span>
          </div>
          <div className="text-sm font-medium text-[#f1f5f9] truncate">{item.ai_hook??item.idea_text}</div>
          {item.ai_caption&&<div className="text-xs text-[#64748b] mt-0.5 line-clamp-2">{item.ai_caption}</div>}
          {item.ig_permalink&&<a href={item.ig_permalink} target="_blank" rel="noreferrer" className="text-xs text-[#7c3aed] hover:text-[#a78bfa] mt-1 inline-block">View on Instagram →</a>}
        </div>
        <button onClick={()=>setExpanded(v=>!v)} className="text-[#64748b] hover:text-[#f1f5f9] text-sm flex-shrink-0 mt-1">{expanded?'▲':'▼'}</button>
      </div>
      {expanded&&(
        <div className="mt-4 pt-4 border-t border-[#1e1e2e] flex flex-col gap-3">
          {item.ai_caption&&<div><div className="text-xs font-bold text-[#64748b] mb-1">CAPTION</div><p className="text-xs text-[#94a3b8] whitespace-pre-wrap leading-relaxed">{item.ai_caption}</p></div>}
          {item.ai_hashtags&&<div><div className="text-xs font-bold text-[#64748b] mb-1">HASHTAGS</div><div className="flex flex-wrap gap-1">{item.ai_hashtags.map((h,i)=><span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#7c3aed22] text-[#a78bfa] font-mono">#{h}</span>)}</div></div>}
          {item.ai_script&&<div><div className="text-xs font-bold text-[#64748b] mb-1">VIDEO SCRIPT</div><pre className="text-xs text-[#94a3b8] whitespace-pre-wrap font-mono bg-[#ffffff04] p-3 rounded-xl overflow-auto max-h-40">{item.ai_script}</pre></div>}
        </div>
      )}
      <div className="mt-4 flex gap-2 flex-wrap">
        {item.status==='awaiting_approval'&&(<><button onClick={onApprove} className="btn-primary px-4 py-2 text-xs">✅ Approve</button><button onClick={onReject} className="px-4 py-2 rounded-xl border border-[#ef444444] text-xs text-[#f87171] hover:bg-[#ef444411]">❌ Reject</button></>)}
        {item.status==='approved'&&(<><button onClick={onPostNow} className="btn-primary px-4 py-2 text-xs">🚀 Post Now</button><button onClick={onSchedule} className="px-4 py-2 rounded-xl border border-[#3b82f644] text-xs text-[#60a5fa] hover:bg-[#3b82f611]">📅 Schedule</button></>)}
        {item.status==='scheduled'&&item.scheduled_at&&<div className="text-xs text-[#60a5fa]">📅 Scheduled for {new Date(item.scheduled_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</div>}
        {item.status==='posted'&&item.ig_permalink&&<a href={item.ig_permalink} target="_blank" rel="noreferrer" className="px-4 py-2 rounded-xl border border-[#10b98144] text-xs text-[#34d399] hover:bg-[#10b98111]">🌐 View Live</a>}
      </div>
    </div>
  );
}

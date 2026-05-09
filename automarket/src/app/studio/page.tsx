'use client';
import { useState, useRef, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import type { Platform, ContentType, Tone } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface GeneratedContent { hook: string; caption: string; hashtags: string[]; script: string; cta: string; }
type Step = 'input' | 'generating' | 'review';

const TONES: { value: Tone; label: string; emoji: string; desc: string }[] = [
  { value:'viral',         label:'Viral',         emoji:'🔥', desc:'Pattern-interrupt. Must share.' },
  { value:'funny',         label:'Funny',         emoji:'😂', desc:'Memes, roasts, relatable pain.' },
  { value:'educational',   label:'Educational',   emoji:'📚', desc:'One insight, crystal clear.' },
  { value:'inspirational', label:'Inspirational', emoji:'💪', desc:'Before/after. Emotion wins.' },
  { value:'behind_scenes', label:'BTS',            emoji:'👀', desc:'Raw, authentic, sneak peek.' },
];
const PLATFORMS: { value: Platform; label: string; icon: string }[] = [
  { value:'instagram', label:'Instagram', icon:'📸' },
  { value:'youtube',   label:'YouTube',   icon:'▶️' },
  { value:'both',      label:'Both',      icon:'🎯' },
];
const CONTENT_TYPES: { value: ContentType; label: string; note: string }[] = [
  { value:'reel',     label:'Reel / Short', note:'15–60s video' },
  { value:'post',     label:'Static Post',  note:'Photo + caption' },
  { value:'carousel', label:'Carousel',     note:'Multi-photo swipe' },
  { value:'story',    label:'Story',        note:'24h ephemeral' },
];

export default function Studio() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('input');
  const [idea, setIdea] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [contentType, setContentType] = useState<ContentType>('reel');
  const [tone, setTone] = useState<Tone>('viral');
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<keyof GeneratedContent | null>(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [regenLoading, setRegenLoading] = useState<keyof GeneratedContent | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    addImages(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')));
  }, []);

  function addImages(files: File[]) {
    const next = [...images, ...files].slice(0, 10);
    setImages(next); setPreviews(next.map(f => URL.createObjectURL(f)));
  }

  async function handleGenerate() {
    if (!idea.trim()) { setError('Tell me your idea first!'); return; }
    setError(''); setStep('generating');
    let imageUrls: string[] = [];
    if (images.length > 0) {
      imageUrls = await Promise.all(images.map(async (file) => {
        const path = `content/${Date.now()}_${file.name.replace(/\s+/g,'_')}`;
        const { error: upErr } = await supabase.storage.from('automarket').upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        return supabase.storage.from('automarket').getPublicUrl(path).data.publicUrl;
      }));
    }
    const { data: record, error: dbErr } = await supabase.from('am_content').insert({ idea_text: idea.trim(), image_urls: imageUrls, platform, content_type: contentType, tone, status: 'draft' }).select().single();
    if (dbErr || !record) { setError('Failed to save. Check Supabase config.'); setStep('input'); return; }
    setContentId(record.id as string);
    const res = await fetch('/api/generate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ contentId: record.id, idea: idea.trim(), platform, contentType, tone }) });
    const json = await res.json() as { content?: GeneratedContent; error?: string };
    if (!res.ok || json.error) { setError(json.error ?? 'Generation failed'); setStep('input'); return; }
    setGenerated(json.content!); setStep('review');
  }

  async function handleApprove() {
    if (!contentId) return; setSaving(true);
    await supabase.from('am_content').update({ status: 'approved', final_caption: generated?.caption, final_hashtags: generated?.hashtags }).eq('id', contentId);
    setSaving(false); router.push('/queue');
  }

  async function handleRegen(section: keyof GeneratedContent) {
    if (!contentId || !generated) return; setRegenLoading(section);
    const res = await fetch('/api/generate', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ contentId, section, currentContent: generated, idea, tone }) });
    const json = await res.json() as { value?: string | string[] };
    if (json.value !== undefined) setGenerated(prev => prev ? { ...prev, [section]: json.value } : prev);
    setRegenLoading(null);
  }

  function startEdit(section: keyof GeneratedContent) {
    if (!generated) return;
    setEditVal(section === 'hashtags' ? (generated.hashtags as string[]).join(', ') : generated[section] as string);
    setEditMode(section);
  }

  function saveEdit() {
    if (!generated || !editMode) return;
    if (editMode === 'hashtags') setGenerated({ ...generated, hashtags: editVal.split(',').map(h => h.trim().replace(/^#/,'')) });
    else setGenerated({ ...generated, [editMode]: editVal });
    setEditMode(null);
  }

  return (
    <AppShell>
      <div className="p-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-[#f1f5f9]">🎬 Content Studio</h1>
          <p className="text-[#64748b] text-sm mt-1">Drop a photo + your idea → AI builds a full viral content package</p>
        </div>
        <div className="flex items-center gap-3 mb-8">
          {(['input','generating','review'] as Step[]).map((s,i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${step===s?'bg-gradient-to-br from-[#7c3aed] to-[#f059da] text-white':i<['input','generating','review'].indexOf(step)?'bg-[#10b981] text-white':'bg-[#1e1e2e] text-[#64748b]'}`}>
                {i<['input','generating','review'].indexOf(step)?'✓':i+1}
              </div>
              <span className={`text-xs font-medium ${step===s?'text-[#a78bfa]':'text-[#64748b]'}`}>{s==='input'?'Your Idea':s==='generating'?'AI Writes It':'Review & Approve'}</span>
              {i<2&&<div className="w-8 h-px bg-[#1e1e2e]" />}
            </div>
          ))}
        </div>
        {error&&<div className="mb-4 p-3 rounded-xl bg-[#ef444422] border border-[#ef444444] text-sm text-[#f87171]">{error}</div>}

        {step==='input'&&(
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-4">
              <div className="border-2 border-dashed border-[#1e1e2e] rounded-2xl p-6 text-center cursor-pointer hover:border-[#7c3aed66] hover:bg-[#7c3aed08] transition-all" onDragOver={e=>e.preventDefault()} onDrop={onDrop} onClick={()=>fileRef.current?.click()}>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>addImages(Array.from(e.target.files??[]))} />
                {previews.length===0?(<><div className="text-4xl mb-2">📸</div><div className="text-sm font-medium text-[#f1f5f9]">Drop your photos here</div><div className="text-xs text-[#64748b] mt-1">or click to browse · max 10</div></>):(
                  <div className="grid grid-cols-3 gap-2">
                    {previews.map((src,i)=>(
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden">
                        <img src={src} alt="" className="w-full h-full object-cover" />
                        <button onClick={e=>{e.stopPropagation();const n=images.filter((_,j)=>j!==i);setImages(n);setPreviews(n.map(f=>URL.createObjectURL(f)));}} className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full text-white text-xs flex items-center justify-center">✕</button>
                      </div>
                    ))}
                    {previews.length<10&&<div className="aspect-square rounded-lg border-2 border-dashed border-[#1e1e2e] flex items-center justify-center text-[#64748b] text-xl">+</div>}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-1.5 block">Your Idea</label>
                <textarea value={idea} onChange={e=>setIdea(e.target.value)} placeholder="e.g. Show how the God Particle predicts where market reverses every expiry..." rows={4} className="w-full bg-[#111118] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] placeholder-[#3f3f5a] resize-none focus:outline-none focus:border-[#7c3aed66]" />
              </div>
            </div>
            <div className="flex flex-col gap-5">
              <div>
                <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">Platform</label>
                <div className="flex gap-2">{PLATFORMS.map(p=>(<button key={p.value} onClick={()=>setPlatform(p.value)} className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-bold transition-all ${platform===p.value?'border-[#7c3aed] bg-[#7c3aed22] text-[#a78bfa]':'border-[#1e1e2e] text-[#64748b] hover:border-[#ffffff18]'}`}><span className="text-lg">{p.icon}</span>{p.label}</button>))}</div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">Content Type</label>
                <div className="grid grid-cols-2 gap-2">{CONTENT_TYPES.map(ct=>(<button key={ct.value} onClick={()=>setContentType(ct.value)} className={`py-2 px-3 rounded-xl border text-left transition-all ${contentType===ct.value?'border-[#7c3aed] bg-[#7c3aed22]':'border-[#1e1e2e] hover:border-[#ffffff18]'}`}><div className={`text-xs font-bold ${contentType===ct.value?'text-[#a78bfa]':'text-[#f1f5f9]'}`}>{ct.label}</div><div className="text-[10px] text-[#64748b]">{ct.note}</div></button>))}</div>
              </div>
              <div>
                <label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">Tone</label>
                <div className="flex flex-col gap-1.5">{TONES.map(t=>(<button key={t.value} onClick={()=>setTone(t.value)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${tone===t.value?'border-[#7c3aed] bg-[#7c3aed22]':'border-[#1e1e2e] hover:border-[#ffffff18]'}`}><span className="text-base">{t.emoji}</span><div><div className={`text-xs font-bold ${tone===t.value?'text-[#a78bfa]':'text-[#f1f5f9]'}`}>{t.label}</div><div className="text-[10px] text-[#64748b]">{t.desc}</div></div></button>))}</div>
              </div>
              <button className="btn-primary w-full py-3 text-sm mt-auto" onClick={handleGenerate}>✨ Generate Viral Content</button>
            </div>
          </div>
        )}

        {step==='generating'&&(
          <div className="card flex flex-col items-center justify-center py-20 gap-6">
            <div className="relative"><div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{background:'linear-gradient(135deg,#7c3aed,#f059da)'}}>🤖</div><div className="absolute -bottom-1 -right-1 spinner" /></div>
            <div className="text-center"><div className="font-black text-[#f1f5f9] text-lg mb-1">Claude is cooking...</div><div className="text-[#64748b] text-sm">Writing hook, caption, hashtags, and full video script</div></div>
          </div>
        )}

        {step==='review'&&generated&&(
          <div className="flex flex-col gap-4">
            <ContentBlock icon="⚡" title="Hook" section="hook" value={generated.hook} editMode={editMode} editVal={editVal} regenLoading={regenLoading} onEdit={()=>startEdit('hook')} onRegen={()=>handleRegen('hook')} onEditVal={setEditVal} onSaveEdit={saveEdit} onCancelEdit={()=>setEditMode(null)} />
            <ContentBlock icon="📝" title="Caption" section="caption" value={generated.caption} editMode={editMode} editVal={editVal} regenLoading={regenLoading} onEdit={()=>startEdit('caption')} onRegen={()=>handleRegen('caption')} onEditVal={setEditVal} onSaveEdit={saveEdit} onCancelEdit={()=>setEditMode(null)} multiline />
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><span>#️⃣</span><span className="font-bold text-sm text-[#f1f5f9]">Hashtags</span><span className="text-xs text-[#64748b]">({generated.hashtags.length}/30)</span></div>
                <div className="flex gap-2"><ActionBtn icon="✏️" label="Edit" onClick={()=>startEdit('hashtags')} /><ActionBtn icon="🔄" label="Redo" onClick={()=>handleRegen('hashtags')} loading={regenLoading==='hashtags'} /></div>
              </div>
              {editMode==='hashtags'?(<EditInline value={editVal} onChange={setEditVal} onSave={saveEdit} onCancel={()=>setEditMode(null)} />):(<div className="flex flex-wrap gap-1.5">{generated.hashtags.map((h,i)=><span key={i} className="text-xs px-2 py-1 rounded-full bg-[#7c3aed22] text-[#a78bfa] font-mono">#{h}</span>)}</div>)}
            </div>
            <ContentBlock icon="🎬" title="Video Script" section="script" value={generated.script} editMode={editMode} editVal={editVal} regenLoading={regenLoading} onEdit={()=>startEdit('script')} onRegen={()=>handleRegen('script')} onEditVal={setEditVal} onSaveEdit={saveEdit} onCancelEdit={()=>setEditMode(null)} multiline mono />
            <ContentBlock icon="🎯" title="Call To Action" section="cta" value={generated.cta} editMode={editMode} editVal={editVal} regenLoading={regenLoading} onEdit={()=>startEdit('cta')} onRegen={()=>handleRegen('cta')} onEditVal={setEditVal} onSaveEdit={saveEdit} onCancelEdit={()=>setEditMode(null)} />
            <div className="flex gap-3 mt-2">
              <button onClick={()=>{setStep('input');setGenerated(null);}} className="flex-1 py-3 rounded-xl border border-[#1e1e2e] text-sm text-[#64748b] hover:border-[#ffffff18] hover:text-[#f1f5f9] transition-all font-bold">← Start Over</button>
              <button onClick={handleApprove} disabled={saving} className="flex-[2] btn-primary py-3 text-sm flex items-center justify-center gap-2">{saving?<span className="spinner" />:'✅'}{saving?'Saving...':'Approve → Move to Queue'}</button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ContentBlock({icon,title,section,value,editMode,editVal,regenLoading,onEdit,onRegen,onEditVal,onSaveEdit,onCancelEdit,multiline,mono}:{icon:string;title:string;section:keyof GeneratedContent;value:string;editMode:keyof GeneratedContent|null;editVal:string;regenLoading:keyof GeneratedContent|null;onEdit:()=>void;onRegen:()=>void;onEditVal:(v:string)=>void;onSaveEdit:()=>void;onCancelEdit:()=>void;multiline?:boolean;mono?:boolean}) {
  const isEditing = editMode===section;
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2"><span>{icon}</span><span className="font-bold text-sm text-[#f1f5f9]">{title}</span></div>
        <div className="flex gap-2"><ActionBtn icon="✏️" label="Edit" onClick={onEdit} /><ActionBtn icon="🔄" label="Redo" onClick={onRegen} loading={regenLoading===section} /><ActionBtn icon="📋" label="Copy" onClick={()=>navigator.clipboard.writeText(value)} /></div>
      </div>
      {isEditing?(<EditInline value={editVal} onChange={onEditVal} onSave={onSaveEdit} onCancel={onCancelEdit} multiline />):(<p className={`text-sm text-[#94a3b8] leading-relaxed whitespace-pre-wrap ${mono?'font-mono text-xs bg-[#ffffff04] p-3 rounded-lg':''}`}>{value}</p>)}
    </div>
  );
}

function ActionBtn({icon,label,onClick,loading}:{icon:string;label:string;onClick:()=>void;loading?:boolean}) {
  return <button onClick={onClick} disabled={loading} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-[#64748b] hover:bg-[#ffffff08] hover:text-[#f1f5f9] transition-all font-medium disabled:opacity-50">{loading?<span className="spinner" style={{width:12,height:12}} />:icon}{label}</button>;
}

function EditInline({value,onChange,onSave,onCancel,multiline}:{value:string;onChange:(v:string)=>void;onSave:()=>void;onCancel:()=>void;multiline?:boolean}) {
  return (
    <div className="flex flex-col gap-2">
      {multiline?(<textarea value={value} onChange={e=>onChange(e.target.value)} rows={6} className="w-full bg-[#0d0d14] border border-[#7c3aed66] rounded-xl p-3 text-sm text-[#f1f5f9] resize-none focus:outline-none" autoFocus />):(<input value={value} onChange={e=>onChange(e.target.value)} className="w-full bg-[#0d0d14] border border-[#7c3aed66] rounded-xl p-3 text-sm text-[#f1f5f9] focus:outline-none" autoFocus />)}
      <div className="flex gap-2"><button onClick={onSave} className="btn-primary px-4 py-1.5 text-xs">Save</button><button onClick={onCancel} className="px-4 py-1.5 rounded-lg border border-[#1e1e2e] text-xs text-[#64748b] hover:text-[#f1f5f9]">Cancel</button></div>
    </div>
  );
}

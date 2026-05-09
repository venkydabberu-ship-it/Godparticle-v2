'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import type { AmAutomationRule } from '@/lib/supabase';

const TRIGGER_TYPES = [
  {value:'comment_keyword',label:'Comment Keyword',emoji:'💬'},{value:'dm_keyword',label:'DM Keyword',emoji:'📩'},
  {value:'new_follower',label:'New Follower',emoji:'👤'},{value:'story_reply',label:'Story Reply',emoji:'📲'},{value:'post_tag',label:'Post Tag',emoji:'🏷️'},
];
const ACTION_TYPES = [
  {value:'reply_comment',label:'Reply to Comment',emoji:'💬'},{value:'send_dm',label:'Send DM',emoji:'📩'},
  {value:'like_comment',label:'Like Comment',emoji:'❤️'},{value:'follow_back',label:'Follow Back',emoji:'👤'},
];
const EXAMPLES = [
  {name:'Product Link DM',trigger:'comment_keyword',keywords:['link','price','buy','how','where'],action:'send_dm',message:'Hey {{username}}! 👋 Here\'s the link: GodParticle.in 🚀'},
  {name:'Welcome New Follower',trigger:'new_follower',keywords:[],action:'send_dm',message:'Welcome to the tribe, {{username}}! 🔥\n\nTry it free — GodParticle.in'},
  {name:'Like All Comments',trigger:'comment_keyword',keywords:[],action:'like_comment',message:''},
];

export default function Automate() {
  const [rules,setRules] = useState<AmAutomationRule[]>([]);
  const [loading,setLoading] = useState(true);
  const [showForm,setShowForm] = useState(false);
  const [saving,setSaving] = useState(false);
  const [msg,setMsg] = useState('');
  const [name,setName] = useState('');
  const [platform,setPlatform] = useState<'instagram'|'youtube'|'both'>('instagram');
  const [triggerType,setTriggerType] = useState('comment_keyword');
  const [keywords,setKeywords] = useState('');
  const [matchMode,setMatchMode] = useState<'any'|'all'|'exact'>('any');
  const [actionType,setActionType] = useState('reply_comment');
  const [actionMsg,setActionMsg] = useState('');
  const [delay,setDelay] = useState(0);

  useEffect(()=>{loadRules();},[]);

  async function loadRules() {
    setLoading(true);
    const {data} = await supabase.from('am_automation_rules').select('*').order('created_at',{ascending:false});
    setRules((data??[]) as AmAutomationRule[]); setLoading(false);
  }

  async function handleSave() {
    if (!name.trim()) {setMsg('Give this rule a name!');return;}
    setSaving(true);
    const {error} = await supabase.from('am_automation_rules').insert({name:name.trim(),platform,trigger_type:triggerType,trigger_keywords:keywords?keywords.split(',').map(k=>k.trim()).filter(Boolean):[],match_mode:matchMode,action_type:actionType,action_message:actionMsg.trim()||null,delay_seconds:delay,is_active:true});
    setSaving(false);
    if (error) {setMsg(`Error: ${error.message}`);return;}
    setMsg('✅ Rule created!'); setShowForm(false); resetForm(); loadRules();
  }

  async function toggleRule(id:string,current:boolean) { await supabase.from('am_automation_rules').update({is_active:!current}).eq('id',id); loadRules(); }
  async function deleteRule(id:string) { if (!confirm('Delete this rule?')) return; await supabase.from('am_automation_rules').delete().eq('id',id); loadRules(); }

  function resetForm() { setName('');setPlatform('instagram');setTriggerType('comment_keyword');setKeywords('');setMatchMode('any');setActionType('reply_comment');setActionMsg('');setDelay(0); }
  function applyExample(ex:typeof EXAMPLES[0]) { setName(ex.name);setTriggerType(ex.trigger);setKeywords(ex.keywords.join(', '));setActionType(ex.action);setActionMsg(ex.message);setShowForm(true); }

  return (
    <AppShell>
      <div className="p-8 max-w-4xl">
        <div className="flex items-start justify-between mb-6">
          <div><h1 className="text-2xl font-black text-[#f1f5f9]">🤖 Automation Rules</h1><p className="text-[#64748b] text-sm mt-1">Auto-reply to comments, DMs, and new followers — 24/7</p></div>
          <button onClick={()=>{resetForm();setShowForm(v=>!v);}} className="btn-primary text-sm px-5 py-2.5">{showForm?'✕ Cancel':'+ New Rule'}</button>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card text-center"><div className="text-2xl font-black text-[#a78bfa]">{rules.length}</div><div className="text-xs text-[#64748b] mt-0.5">Total Rules</div></div>
          <div className="card text-center"><div className="text-2xl font-black text-[#34d399]">{rules.filter(r=>r.is_active).length}</div><div className="text-xs text-[#64748b] mt-0.5">Active</div></div>
          <div className="card text-center"><div className="text-2xl font-black text-[#f59e0b]">{rules.reduce((s,r)=>s+(r.trigger_count??0),0)}</div><div className="text-xs text-[#64748b] mt-0.5">Total Triggers</div></div>
        </div>
        {msg&&<div className="mb-4 px-4 py-3 rounded-xl bg-[#10b98122] border border-[#10b98144] text-sm text-[#34d399]">{msg}<button onClick={()=>setMsg('')} className="ml-3 text-[#64748b]">✕</button></div>}
        {!showForm&&(
          <div className="mb-6">
            <div className="text-xs font-bold text-[#64748b] uppercase tracking-wider mb-2">Quick Start Templates</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {EXAMPLES.map(ex=>(<button key={ex.name} onClick={()=>applyExample(ex)} className="card text-left hover:border-[#7c3aed44] hover:bg-[#7c3aed08] transition-all"><div className="text-sm font-bold text-[#f1f5f9] mb-1">{ex.name}</div><div className="text-xs text-[#64748b]">When: <span className="text-[#a78bfa]">{ex.trigger.replace('_',' ')}</span><br/>Then: <span className="text-[#34d399]">{ex.action.replace('_',' ')}</span></div><div className="mt-2 text-[10px] text-[#7c3aed] font-medium">Use this template →</div></button>))}
            </div>
          </div>
        )}
        {showForm&&(
          <div className="card border-[#7c3aed33] mb-6">
            <h2 className="font-black text-[#f1f5f9] mb-5">New Automation Rule</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2"><label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-1.5 block">Rule Name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Send product link on DM" className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] focus:outline-none focus:border-[#7c3aed66]" /></div>
              <div><label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">Platform</label><div className="flex gap-2">{(['instagram','youtube','both'] as const).map(p=>(<button key={p} onClick={()=>setPlatform(p)} className={`flex-1 py-2 rounded-xl border text-xs font-bold capitalize transition-all ${platform===p?'border-[#7c3aed] bg-[#7c3aed22] text-[#a78bfa]':'border-[#1e1e2e] text-[#64748b]'}`}>{p}</button>))}</div></div>
              <div><label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">Trigger</label><select value={triggerType} onChange={e=>setTriggerType(e.target.value)} className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] focus:outline-none">{TRIGGER_TYPES.map(t=>(<option key={t.value} value={t.value}>{t.emoji} {t.label}</option>))}</select></div>
              {['comment_keyword','dm_keyword'].includes(triggerType)&&(
                <div className="md:col-span-2"><label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-1.5 block">Keywords <span className="text-[#64748b] font-normal normal-case">(comma-separated)</span></label><input value={keywords} onChange={e=>setKeywords(e.target.value)} placeholder="price, link, buy..." className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] focus:outline-none mb-2" /><div className="flex gap-2">{(['any','all','exact'] as const).map(m=>(<button key={m} onClick={()=>setMatchMode(m)} className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${matchMode===m?'border-[#7c3aed] bg-[#7c3aed22] text-[#a78bfa]':'border-[#1e1e2e] text-[#64748b]'}`}>{m==='any'?'Match Any':m==='all'?'Match All':'Exact Match'}</button>))}</div></div>
              )}
              <div><label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-2 block">Action</label><select value={actionType} onChange={e=>setActionType(e.target.value)} className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] focus:outline-none">{ACTION_TYPES.map(a=>(<option key={a.value} value={a.value}>{a.emoji} {a.label}</option>))}</select></div>
              <div><label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-1.5 block">Delay (seconds)</label><input type="number" min={0} max={3600} value={delay} onChange={e=>setDelay(Number(e.target.value))} className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] focus:outline-none" /></div>
              {['reply_comment','send_dm'].includes(actionType)&&(<div className="md:col-span-2"><label className="text-xs font-bold text-[#94a3b8] uppercase tracking-wider mb-1.5 block">Message — use {'{{'+'username{{'+'}} as token</label><textarea value={actionMsg} onChange={e=>setActionMsg(e.target.value)} rows={4} placeholder="Hey {{username}}! Here's the link: GodParticle.in 🚀" className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-3 text-sm text-[#f1f5f9] focus:outline-none resize-none" /></div>)}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={()=>{setShowForm(false);resetForm();}} className="flex-1 py-3 rounded-xl border border-[#1e1e2e] text-sm text-[#64748b]">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-[2] btn-primary py-3 text-sm flex items-center justify-center gap-2">{saving?<span className="spinner" />:'🤖'}{saving?'Saving...':'Create Rule'}</button>
            </div>
          </div>
        )}
        {loading?(<div className="flex items-center gap-2 text-[#64748b] py-4"><span className="spinner" /> Loading...</div>):rules.length===0?(<div className="card text-center py-12"><div className="text-4xl mb-3">🤖</div><div className="text-[#f1f5f9] font-bold mb-1">No rules yet</div></div>):(
          <div className="flex flex-col gap-3">{rules.map(rule=>(<RuleCard key={rule.id} rule={rule} onToggle={()=>toggleRule(rule.id,rule.is_active)} onDelete={()=>deleteRule(rule.id)} />))}</div>
        )}
      </div>
    </AppShell>
  );
}

function RuleCard({rule,onToggle,onDelete}:{rule:AmAutomationRule;onToggle:()=>void;onDelete:()=>void}) {
  const trigger = TRIGGER_TYPES.find(t=>t.value===rule.trigger_type);
  const action  = ACTION_TYPES.find(a=>a.value===rule.action_type);
  return (
    <div className={`card transition-all ${rule.is_active?'border-[#1e1e2e]':'opacity-50'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1"><span className="font-bold text-sm text-[#f1f5f9]">{rule.name}</span><span className="text-[10px] px-2 py-0.5 rounded-full capitalize" style={{background:'#7c3aed22',color:'#a78bfa'}}>{rule.platform}</span></div>
          <div className="flex items-center gap-2 text-xs text-[#64748b] flex-wrap">
            <span className="bg-[#1e1e2e] px-2 py-0.5 rounded-full">{trigger?.emoji} When: {trigger?.label}{rule.trigger_keywords?.length>0&&` → "${rule.trigger_keywords.slice(0,2).join('\', \'')}"` }</span>
            <span className="text-[#3f3f5a]">→</span>
            <span className="bg-[#1e1e2e] px-2 py-0.5 rounded-full">{action?.emoji} {action?.label}</span>
          </div>
          {rule.action_message&&<p className="text-xs text-[#3f3f5a] mt-1.5 line-clamp-1 italic">"{rule.action_message}"</p>}
          <div className="flex items-center gap-3 mt-2"><span className="text-xs text-[#64748b]">Fired <span className="text-[#f59e0b] font-bold">{rule.trigger_count}</span> times</span></div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button onClick={onToggle} className={`relative w-11 h-6 rounded-full transition-all ${rule.is_active?'bg-gradient-to-r from-[#7c3aed] to-[#f059da]':'bg-[#1e1e2e]'}`}><div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow ${rule.is_active?'left-6':'left-1'}`} /></button>
          <button onClick={onDelete} className="text-[#3f3f5a] hover:text-[#ef4444] text-sm">🗑️</button>
        </div>
      </div>
    </div>
  );
}

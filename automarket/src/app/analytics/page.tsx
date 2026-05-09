'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';

interface AccountInfo { display_name:string; handle:string; follower_count:number; following_count:number; media_count:number; last_synced_at:string|null; }

export default function Analytics() {
  const [ig,setIg] = useState<AccountInfo|null>(null);
  const [posts,setPosts] = useState<{status:string;ig_like_count:number|null;ig_comment_count:number|null;ai_hook:string|null;posted_at:string|null}[]>([]);
  const [loading,setLoading] = useState(true);
  const [syncing,setSyncing] = useState(false);

  useEffect(()=>{load();},[]);

  async function load() {
    setLoading(true);
    const [accRes,postsRes] = await Promise.all([
      supabase.from('am_accounts').select('*').eq('platform','instagram').single(),
      supabase.from('am_content').select('status,ig_like_count,ig_comment_count,ai_hook,posted_at').eq('status','posted').order('posted_at',{ascending:false}).limit(10),
    ]);
    if (accRes.data) setIg(accRes.data as AccountInfo);
    setPosts(postsRes.data??[]); setLoading(false);
  }

  async function handleSync() { setSyncing(true); await fetch('/api/instagram/accounts'); await load(); setSyncing(false); }

  const totalLikes    = posts.reduce((s,p)=>s+(p.ig_like_count??0),0);
  const totalComments = posts.reduce((s,p)=>s+(p.ig_comment_count??0),0);
  const avgEngagement = posts.length>0?((totalLikes+totalComments)/posts.length).toFixed(1):'—';

  return (
    <AppShell>
      <div className="p-8 max-w-4xl">
        <div className="flex items-start justify-between mb-6">
          <div><h1 className="text-2xl font-black text-[#f1f5f9]">📊 Analytics</h1><p className="text-[#64748b] text-sm mt-1">Account performance and post metrics</p></div>
          <button onClick={handleSync} disabled={syncing} className="btn-primary text-sm px-4 py-2.5 flex items-center gap-2">{syncing?<span className="spinner" />:'🔄'}{syncing?'Syncing...':'Sync Account'}</button>
        </div>
        {loading?(<div className="flex items-center gap-2 text-[#64748b] py-8"><span className="spinner" /> Loading...</div>):(
          <>
            {ig?(
              <div className="card mb-6 border-[#e1306c33]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{background:'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)'}}>📸</div>
                  <div><div className="font-black text-[#f1f5f9]">@{ig.handle}</div><div className="text-xs text-[#64748b]">{ig.last_synced_at?`Last synced ${new Date(ig.last_synced_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})}`:'Not yet synced'}</div></div>
                  <div className="ml-auto flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-[#10b981]" /><span className="text-xs text-[#10b981] font-bold">Connected</span></div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Metric label="Followers" value={ig.follower_count.toLocaleString('en-IN')} accent="#f059da" />
                  <Metric label="Following" value={ig.following_count.toLocaleString('en-IN')} accent="#7c3aed" />
                  <Metric label="Posts"     value={ig.media_count.toString()} accent="#3b82f6" />
                </div>
              </div>
            ):(
              <div className="card mb-6 text-center py-8"><div className="text-3xl mb-2">📡</div><div className="text-[#f1f5f9] font-bold mb-1">Instagram not synced yet</div><div className="text-[#64748b] text-sm mb-4">Click "Sync Account" to pull your stats</div></div>
            )}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="card text-center"><div className="text-2xl font-black text-[#f059da]">{totalLikes.toLocaleString()}</div><div className="text-xs text-[#64748b] mt-0.5">Total Likes</div></div>
              <div className="card text-center"><div className="text-2xl font-black text-[#a78bfa]">{totalComments.toLocaleString()}</div><div className="text-xs text-[#64748b] mt-0.5">Total Comments</div></div>
              <div className="card text-center"><div className="text-2xl font-black text-[#34d399]">{avgEngagement}</div><div className="text-xs text-[#64748b] mt-0.5">Avg. Engagement</div></div>
            </div>
            <div className="card">
              <h2 className="font-black text-[#f1f5f9] mb-4">Recent Posts Performance</h2>
              {posts.length===0?(<div className="text-center py-6 text-[#64748b] text-sm">No posted content yet</div>):(
                <div className="flex flex-col gap-2">{posts.map((p,i)=>(
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-[#1e1e2e] last:border-0">
                    <div className="w-7 h-7 rounded-lg bg-[#1e1e2e] flex items-center justify-center text-xs font-bold text-[#64748b] flex-shrink-0">{i+1}</div>
                    <div className="flex-1 min-w-0"><div className="text-xs text-[#f1f5f9] truncate">{p.ai_hook??'Post'}</div><div className="text-[10px] text-[#64748b]">{p.posted_at?new Date(p.posted_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'—'}</div></div>
                    <div className="flex items-center gap-3 text-xs flex-shrink-0"><span className="text-[#f059da]">❤️ {p.ig_like_count??0}</span><span className="text-[#a78bfa]">💬 {p.ig_comment_count??0}</span></div>
                  </div>
                ))}</div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Metric({label,value,accent}:{label:string;value:string;accent:string}) {
  return <div className="text-center"><div className="text-xl font-black" style={{color:accent}}>{value}</div><div className="text-xs text-[#64748b] mt-0.5">{label}</div></div>;
}

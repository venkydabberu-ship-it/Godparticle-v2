'use client';
import { useEffect, useState } from 'react';
import AppShell from '@/components/AppShell';
import { supabase } from '@/lib/supabase';
import type { AmContent } from '@/lib/supabase';
import Link from 'next/link';

interface Stats {
  totalContent: number;
  awaitingApproval: number;
  scheduled: number;
  posted: number;
  automationRules: number;
  activeRules: number;
  totalTriggers: number;
}

const EMPTY_STATS: Stats = {
  totalContent: 0, awaitingApproval: 0, scheduled: 0, posted: 0,
  automationRules: 0, activeRules: 0, totalTriggers: 0,
};

export default function Dashboard() {
  const [stats, setStats]       = useState<Stats>(EMPTY_STATS);
  const [recent, setRecent]     = useState<AmContent[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  async function loadDashboard() {
    setLoading(true);

    const [contentRes, rulesRes, recentRes] = await Promise.all([
      supabase.from('am_content').select('status'),
      supabase.from('am_automation_rules').select('is_active, trigger_count'),
      supabase.from('am_content').select('*').order('created_at', { ascending: false }).limit(5),
    ]);

    const content = contentRes.data ?? [];
    const rules   = rulesRes.data   ?? [];

    setStats({
      totalContent:     content.length,
      awaitingApproval: content.filter(c => c.status === 'awaiting_approval').length,
      scheduled:        content.filter(c => c.status === 'scheduled').length,
      posted:           content.filter(c => c.status === 'posted').length,
      automationRules:  rules.length,
      activeRules:      rules.filter(r => r.is_active).length,
      totalTriggers:    rules.reduce((s: number, r: { trigger_count: number }) => s + (r.trigger_count ?? 0), 0),
    });

    setRecent((recentRes.data ?? []) as AmContent[]);
    setLoading(false);
  }

  return (
    <AppShell>
      <div className="p-8 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-[#f1f5f9] mb-1">
            Good morning, boss 👋
          </h1>
          <p className="text-[#64748b] text-sm">
            Your AI marketing engine is running. Here's what's happening.
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon="⏳" label="Awaiting Approval" value={stats.awaitingApproval}
            accent="#f59e0b" link="/queue?filter=awaiting_approval" />
          <StatCard icon="📅" label="Scheduled Posts" value={stats.scheduled}
            accent="#3b82f6" link="/queue?filter=scheduled" />
          <StatCard icon="✅" label="Posts Live" value={stats.posted}
            accent="#10b981" link="/queue?filter=posted" />
          <StatCard icon="🤖" label="Auto Triggers" value={stats.totalTriggers}
            accent="#7c3aed" link="/automate" />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <QuickAction
            href="/studio"
            icon="🎬"
            title="Create Content"
            desc="Upload photo + idea → AI generates viral content in seconds"
            gradient="from-[#7c3aed] to-[#f059da]"
          />
          <QuickAction
            href="/queue"
            icon="📋"
            title={`Review Queue (${stats.awaitingApproval})`}
            desc="Approve, edit, or schedule your AI-generated content"
            gradient="from-[#f59e0b] to-[#ef4444]"
          />
          <QuickAction
            href="/ideas"
            icon="💡"
            title="Viral Ideas Bank"
            desc="6 proven viral templates for trading content. Just drop your photo."
            gradient="from-[#10b981] to-[#3b82f6]"
          />
        </div>

        {/* Recent content */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-[#f1f5f9]">Recent Content</h2>
            <Link href="/queue" className="text-xs text-[#7c3aed] hover:text-[#a78bfa] font-medium">
              View all →
            </Link>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-[#64748b] text-sm py-4">
              <span className="spinner" /> Loading...
            </div>
          ) : recent.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">🎬</div>
              <p className="text-[#64748b] text-sm">No content yet.</p>
              <Link href="/studio" className="btn-primary mt-3 inline-block text-sm">
                Create your first post
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recent.map(item => (
                <RecentRow key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-8 card border-[#7c3aed33]">
          <h2 className="font-black text-[#f1f5f9] mb-4">How Automarket Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-center text-xs">
            {[
              { icon: '📸', step: '1', label: 'You drop a photo + idea' },
              { icon: '🤖', step: '2', label: 'Claude AI writes the viral content' },
              { icon: '👀', step: '3', label: 'You preview & approve (or edit)' },
              { icon: '📅', step: '4', label: 'Schedule or post immediately' },
              { icon: '💬', step: '5', label: 'Auto-reply to comments & DMs' },
            ].map(s => (
              <div key={s.step} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#ffffff04]">
                <div className="text-2xl">{s.icon}</div>
                <div className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#f059da)', color: '#fff' }}>
                  {s.step}
                </div>
                <div className="text-[#94a3b8] leading-relaxed">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ icon, label, value, accent, link }: {
  icon: string; label: string; value: number; accent: string; link: string;
}) {
  return (
    <Link href={link} className="card hover:border-[#ffffff18] transition-colors block">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xl">{icon}</span>
        <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
      </div>
      <div className="text-3xl font-black" style={{ color: accent }}>{value}</div>
      <div className="text-xs text-[#64748b] mt-1 font-medium">{label}</div>
    </Link>
  );
}

function QuickAction({ href, icon, title, desc, gradient }: {
  href: string; icon: string; title: string; desc: string; gradient: string;
}) {
  return (
    <Link href={href}
      className="card hover:border-[#ffffff18] transition-all hover:-translate-y-0.5 block group">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 bg-gradient-to-br ${gradient}`}>
        {icon}
      </div>
      <div className="font-black text-[#f1f5f9] text-sm mb-1 group-hover:text-white">{title}</div>
      <div className="text-xs text-[#64748b] leading-relaxed">{desc}</div>
    </Link>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', generating: 'Generating...', awaiting_approval: 'Needs Review',
  approved: 'Approved', scheduled: 'Scheduled', posted: 'Live ✓',
  rejected: 'Rejected', failed: 'Failed',
};

function RecentRow({ item }: { item: AmContent }) {
  const date = new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <Link href={`/queue`}
      className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#ffffff06] transition-colors">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
        style={{ background: item.platform === 'instagram' ? '#e1306c22' : '#ff000022' }}>
        {item.platform === 'instagram' ? '📸' : item.platform === 'youtube' ? '▶️' : '🎯'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-[#f1f5f9] font-medium truncate">
          {item.ai_hook ?? item.idea_text}
        </div>
        <div className="text-xs text-[#64748b]">{date} · {item.content_type}</div>
      </div>
      <span className={`text-xs px-2 py-1 rounded-full font-medium badge-${item.status} flex-shrink-0`}>
        {STATUS_LABEL[item.status] ?? item.status}
      </span>
    </Link>
  );
}

'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const nav = [
  { href: '/',           icon: '⚡', label: 'Dashboard'  },
  { href: '/studio',     icon: '🎬', label: 'Studio'     },
  { href: '/video',      icon: '▶️',  label: 'Video Gen'  },
  { href: '/queue',      icon: '📋', label: 'Queue'      },
  { href: '/automate',   icon: '🤖', label: 'Automate'   },
  { href: '/ideas',      icon: '💡', label: 'Ideas Bank' },
  { href: '/analytics',  icon: '📊', label: 'Analytics'  },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col border-r border-[#1e1e2e] bg-[#0d0d14] z-40">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#f059da)' }}>
            🚀
          </div>
          <div>
            <div className="font-black text-sm grad-text">Automarket</div>
            <div className="text-[10px] text-[#64748b] font-mono">AI Marketing Engine</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {nav.map(item => {
          const active = item.href === '/' ? path === '/' : path.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${active
                  ? 'bg-[#7c3aed22] text-[#a78bfa] border border-[#7c3aed33]'
                  : 'text-[#64748b] hover:text-[#f1f5f9] hover:bg-[#ffffff08]'
                }`}>
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
              {item.href === '/queue' && <QueueBadge />}
            </Link>
          );
        })}
      </nav>

      {/* Platform status */}
      <div className="px-4 py-4 border-t border-[#1e1e2e] flex flex-col gap-2">
        <PlatformDot platform="instagram" label="Instagram" />
        <PlatformDot platform="youtube"   label="YouTube"   />
      </div>
    </aside>
  );
}

function QueueBadge() {
  return (
    <span className="ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full"
      style={{ background: '#f59e0b22', color: '#fbbf24' }}
      id="queue-badge">
    </span>
  );
}

function PlatformDot({ platform, label }: { platform: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[#64748b]">
      <div className="relative w-2 h-2">
        <div className="w-2 h-2 rounded-full bg-[#10b981]" />
        <div className="live-dot absolute inset-0 rounded-full" />
      </div>
      <span>{label}</span>
      <span className="ml-auto text-[10px] text-[#10b981] font-mono">live</span>
    </div>
  );
}

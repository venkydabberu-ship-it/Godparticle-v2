import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#09090f',
        surface: '#111118',
        border: '#1e1e2e',
        primary: '#7c3aed',
        pink: '#f059da',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        muted: '#64748b',
        text: '#f1f5f9',
        dim: '#94a3b8',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'gradient': 'gradient 8s ease infinite',
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

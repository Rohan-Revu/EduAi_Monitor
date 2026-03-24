/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-ibm)', 'IBM Plex Sans', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'monospace'],
        display: ['var(--font-display)', 'Space Grotesk', 'sans-serif'],
      },
      colors: {
        surface: {
          0: '#080c10',
          1: '#0d1117',
          2: '#161b22',
          3: '#1c2128',
          4: '#22272e',
        },
        accent: {
          cyan: '#39d0d8',
          green: '#3fb950',
          amber: '#d29922',
          red: '#f85149',
          purple: '#a371f7',
          blue: '#58a6ff',
        },
        border: 'rgba(255,255,255,0.08)',
      },
      animation: {
        'pulse-dot': 'pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'counter': 'counter 0.6s ease-out',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.3 },
        },
        'slide-in': {
          from: { opacity: 0, transform: 'translateY(-4px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
        'scanline': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(57,208,216,0.15)',
        'glow-green': '0 0 20px rgba(63,185,80,0.15)',
        'glow-red': '0 0 20px rgba(248,81,73,0.15)',
        'panel': '0 1px 3px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
      },
    },
  },
  plugins: [],
};

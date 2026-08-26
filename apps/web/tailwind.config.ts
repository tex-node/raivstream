import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          pink: '#ec4899',
          dark: '#0a0a0a',
        },
        /* Nocturne palette — use as bg-page, text-t1, border-hairline, etc. */
        page:    'var(--noc-page)',
        bar:     'var(--noc-bar)',
        hairline: 'var(--noc-hairline)',
        magenta: 'var(--noc-magenta)',
        purple:  'var(--noc-purple)',
        'noc-blue':   'var(--noc-blue)',
        'noc-cyan':   'var(--noc-cyan)',
        t1: 'var(--noc-t1)',
        t2: 'var(--noc-t2)',
        t3: 'var(--noc-t3)',
        t4: 'var(--noc-t4)',
        t5: 'var(--noc-t5)',
        t6: 'var(--noc-t6)',
        'pink-tint':    'var(--noc-pink-tint)',
        'lavender-tint': 'var(--noc-lavender-tint)',
        'cyan-tint':    'var(--noc-cyan-tint)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [],
};

export default config;

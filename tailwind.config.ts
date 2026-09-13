
import type { Config } from 'tailwindcss'
 
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette — modern SaaS
        primary: {
          50:  '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          900: '#0c4a6e',
        },
        // Sidebar / brand dark
        navy: {
          900: '#0a0f1e',
          800: '#111827',
          700: '#1e2a3b',
          600: '#243044',
        },
        signal: {
          green:  '#22c55e',
          amber:  '#f59e0b',
          red:    '#ef4444',
          blue:   '#3b82f6',
          purple: '#a855f7',
        },
      },
      backgroundImage: {
        'gradient-violet': 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
        'gradient-emerald': 'linear-gradient(135deg, #059669 0%, #047857 100%)',
        'gradient-amber': 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
        'gradient-sky': 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
      },
    },
  },
  plugins: [],
}
 
export default config

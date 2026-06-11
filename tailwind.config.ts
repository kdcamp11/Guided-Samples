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
        brand: {
          green: '#184D3E',
          'green-light': '#1a5c4a',
          'green-dark': '#0f2e25',
        },
        dark: {
          900: '#f9fafb',
          800: '#f1f5f9',
          700: '#ffffff',
          600: '#f8fafc',
          500: '#e2e8f0',
          400: '#cbd5e1',
          300: '#94a3b8',
        }
      }
    },
  },
  plugins: [],
}
export default config

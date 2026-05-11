/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#050A17',
          900: '#070D1F',
          800: '#0C1326',
          700: '#111927',
          600: '#162033',
          500: '#1D2D47',
          400: '#243554',
        },
        accent: {
          orange: '#FF5722',
          'orange-light': '#FF7043',
          blue: '#2563EB',
          'blue-light': '#3B82F6',
        },
        signal: {
          green: '#22C55E',
          amber: '#F59E0B',
          red: '#EF4444',
          purple: '#8B5CF6',
        },
        ink: {
          primary: '#E2E8F4',
          secondary: '#94A3B8',
          muted: '#475569',
          faint: '#2D3F5C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.5)',
        glow: '0 0 20px rgba(37,99,235,0.15)',
        'glow-orange': '0 0 20px rgba(255,87,34,0.2)',
      },
    },
  },
  plugins: [],
};

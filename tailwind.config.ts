import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主色：比默认蓝更沉稳，长表格下不易刺眼
        brand: {
          50: '#eff5ff',
          100: '#dbe8fe',
          200: '#bfd6fe',
          300: '#93bafd',
          400: '#6094fa',
          500: '#3b74f6',
          600: '#2559eb',
          700: '#1d45d8',
          800: '#1e3aaf',
          900: '#1e358a',
          950: '#172354'
        },
        // 中性色偏冷一点点，白色卡片上层次更清楚
        ink: {
          50: '#f7f8fa',
          100: '#eef0f4',
          200: '#e2e5ec',
          300: '#cbd0db',
          400: '#9aa2b1',
          500: '#6b7484',
          600: '#525a68',
          700: '#414855',
          800: '#2b3140',
          900: '#1b1f2a'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif'
        ],
        mono: ['"SF Mono"', 'Consolas', '"Cascadia Mono"', 'Menlo', 'monospace']
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,31,42,0.04), 0 8px 24px -12px rgba(27,31,42,0.12)',
        lift: '0 2px 4px rgba(27,31,42,0.04), 0 16px 40px -16px rgba(27,31,42,0.18)'
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem'
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' }
        },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(0.97) translateY(8px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' }
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' }
        }
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'fade-in': 'fade-in 0.25s ease-out both',
        'pop-in': 'pop-in 0.28s cubic-bezier(0.16,1,0.3,1) both',
        shimmer: 'shimmer 1.6s infinite'
      }
    }
  },
  plugins: []
};

export default config;

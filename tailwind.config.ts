import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          500: '#2f6bff',
          600: '#1c56e8',
          700: '#1544bd',
          900: '#0f2a72'
        }
      }
    }
  },
  plugins: []
};

export default config;

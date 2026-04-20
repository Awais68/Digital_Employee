/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme (cyberpunk green)
        dark: {
          bg: '#0A0A0F',
          card: '#12121A',
          border: '#1A1A24',
          accent: '#00FF88',
          text: '#E0E0E6',
          muted: '#7A7A85',
        },
        // Light theme (blue/white)
        light: {
          bg: '#F9FAFB',
          card: '#FFFFFF',
          border: '#E5E7EB',
          accent: '#3B82F6',
          text: '#1F2937',
          muted: '#9CA3AF',
        }
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        slideDown: 'slideDown 0.3s ease-out',
        fadeIn: 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        slideDown: {
          'from': { transform: 'translateY(-10px)', opacity: '0' },
          'to': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        }
      },
    },
  },
  plugins: [],
}

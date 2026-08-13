/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Sora"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Green scale — brand-600 matches HeroBanner's ACCENT_GREEN (#0B6E4F)
        // exactly, and brand-700 matches the dark-green active-pill /
        // deep-section color (#0A4A34), so every component lines up with
        // the banner already redesigned.
        brand: {
          50: '#EAF5F1',
          100: '#CFE8DF',
          200: '#9FD1BF',
          300: '#6FBA9F',
          400: '#3FA37F',
          500: '#17875F',
          600: '#0B6E4F',
          700: '#0A4A34',
          800: '#0A3A2A',
          900: '#092E22',
          950: '#071F17',
        },
        // Untouched — used only for star ratings / "hot" badges, not part
        // of the purple-to-green theme swap.
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
      },
      boxShadow: {
        glow: '0 0 50px -12px rgba(11, 110, 79, 0.55)',
        'glow-sm': '0 0 25px -8px rgba(11, 110, 79, 0.45)',
        card: '0 14px 40px -18px rgba(10, 74, 52, 0.35)',
        'card-hover': '0 26px 60px -20px rgba(10, 74, 52, 0.5)',
        soft: '0 6px 24px -10px rgba(15, 23, 42, 0.12)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255,255,255,0.15)',
      },
      backgroundImage: {
        'grid-light':
          'linear-gradient(to right, rgba(11,110,79,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(11,110,79,0.06) 1px, transparent 1px)',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translateY(0) rotate(-3deg)' },
          '50%': { transform: 'translateY(-18px) rotate(-1deg)' },
        },
        'float-rev': {
          '0%,100%': { transform: 'translateY(0) rotate(4deg)' },
          '50%': { transform: 'translateY(16px) rotate(2deg)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-700px 0' },
          '100%': { backgroundPosition: '700px 0' },
        },
        'pulse-glow': {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(11,110,79,0.5)' },
          '50%': { boxShadow: '0 0 0 8px rgba(11,110,79,0)' },
        },
        gradient: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-100%)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '60%': { transform: 'scale(1.08)', opacity: '1' },
          '100%': { transform: 'scale(1)' },
        },
        blink: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'rise-up': {
          '0%': { opacity: '0', transform: 'translateY(40px) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        float: 'float 6s ease-in-out infinite',
        'float-rev': 'float-rev 7s ease-in-out infinite',
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22,1,0.36,1) forwards',
        'fade-in': 'fade-in 0.6s ease forwards',
        'scale-in': 'scale-in 0.4s cubic-bezier(0.22,1,0.36,1) forwards',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        gradient: 'gradient 8s ease infinite',
        marquee: 'marquee 30s linear infinite',
        'slide-in-right': 'slide-in-right 0.4s cubic-bezier(0.22,1,0.36,1) forwards',
        'slide-in-left': 'slide-in-left 0.35s cubic-bezier(0.22,1,0.36,1) forwards',
        pop: 'pop 0.5s cubic-bezier(0.22,1,0.36,1) forwards',
        blink: 'blink 1.4s ease-in-out infinite',
        'spin-slow': 'spin-slow 14s linear infinite',
        'rise-up': 'rise-up 0.6s cubic-bezier(0.22,1,0.36,1) forwards',
      },
    },
  },
  plugins: [],
};

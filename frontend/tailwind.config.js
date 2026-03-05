/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      /* ─── Apple-style design tokens ─── */
      colors: {
        // Neutral surface system
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F5F5F7',
          tertiary: '#EBEBED',
          dark: '#1D1D1F',
          'dark-secondary': '#2C2C2E',
          'dark-tertiary': '#3A3A3C',
        },
        // Accent — single brand color, Apple-blue inspired
        accent: {
          DEFAULT: '#0071E3',
          hover: '#0077ED',
          light: '#EBF5FF',
          muted: '#B3D7FF',
          dark: '#0055AA',
        },
        // Semantic severity colors — soft and readable
        severity: {
          major: '#FF3B30',
          'major-bg': '#FFF0EF',
          'major-border': '#FECECA',
          minor: '#FF9500',
          'minor-bg': '#FFF8EE',
          'minor-border': '#FFE0B2',
          suggestion: '#007AFF',
          'suggestion-bg': '#EBF5FF',
          'suggestion-border': '#B3D7FF',
        },
        // Diff colors
        diff: {
          'add-bg': '#ECFDF5',
          'add-border': '#A7F3D0',
          'add-text': '#065F46',
          'del-bg': '#FEF2F2',
          'del-border': '#FECACA',
          'del-text': '#991B1B',
          'context-bg': '#FFFFFF',
        },
        // Text
        txt: {
          primary: '#1D1D1F',
          secondary: '#6E6E73',
          tertiary: '#AEAEB2',
          'dark-primary': '#F5F5F7',
          'dark-secondary': '#A1A1A6',
        },
        // Borders
        border: {
          DEFAULT: '#E5E5EA',
          light: '#F2F2F7',
          dark: '#3A3A3C',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"',
          '"SF Pro Text"', '"Helvetica Neue"', 'Arial', 'sans-serif',
        ],
        mono: [
          '"SF Mono"', 'SFMono-Regular', 'ui-monospace',
          'Menlo', 'Monaco', '"Cascadia Code"', 'monospace',
        ],
      },
      fontSize: {
        'title': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'section': ['18px', { lineHeight: '24px', fontWeight: '500' }],
        'body': ['15px', { lineHeight: '22px', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '16px', fontWeight: '400' }],
        'code': ['13px', { lineHeight: '20px', fontWeight: '400' }],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
        'elevated': '0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        'float': '0 16px 48px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.06)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.1)',
      },
      backdropBlur: {
        'surface': '20px',
      },
      transitionDuration: {
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
      },
      animation: {
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'slide-in-right': 'slideInRight 250ms ease-out',
        'slide-in-up': 'slideInUp 250ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
        'scale-in': 'scaleIn 200ms ease-out',
        'progress-pulse': 'progressPulse 2s ease-in-out infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        progressPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "./context/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary:   { DEFAULT: '#4F46E5', hover: '#4338CA', light: '#EEF2FF', text: '#3730A3' },
        secondary: { DEFAULT: '#7C3AED', hover: '#6D28D9', text: '#5B21B6' },
        success:   { DEFAULT: '#10B981', light: '#D1FAE5', text: '#065F46' },
        warning:   { DEFAULT: '#F59E0B', light: '#FEF3C7', text: '#92400E' },
        danger:    { DEFAULT: '#DC2626', light: '#FEE2E2', hover: '#B91C1C' },
        'app-bg':  '#F8FAFC',
        surface:   '#FFFFFF',
        border:    '#E2E8F0',
        muted:     '#F8FAFC',
        'text-base': '#0F172A',
        'text-muted': '#64748B',
      },
      fontFamily: {
        sans:    ['"Plus Jakarta Sans"', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'sans-serif'],
        body:    ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      spacing: {
        sidebar:             '240px',
        'sidebar-collapsed': '64px',
        'top-bar':           '56px',
        'bottom-nav':        '64px',
      },
      borderRadius: {
        card:     '16px',
        btn:      '999px',
        'btn-sm': '8px',
        input:    '8px',
        badge:    '999px',
        modal:    '20px',
      },
      boxShadow: {
        card:         '0 1px 3px rgba(79,70,229,0.06), 0 4px 16px rgba(79,70,229,0.08)',
        'card-hover': '0 4px 24px rgba(79,70,229,0.14)',
        modal:        '0 8px 40px rgba(79,70,229,0.18)',
      },
      zIndex: {
        sticky:         '10',
        'table-header': '11',
        sidebar:        '20',
        topbar:         '30',
        bottomnav:      '40',
        modal:          '50',
        toast:          '60',
      },
      backgroundImage: {
        'gradient-primary':   'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
        'gradient-primary-r': 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
      },
    },
  },
  plugins: [],
}

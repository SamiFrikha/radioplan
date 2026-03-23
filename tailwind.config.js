/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./index.tsx",
    "./App.tsx",
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./context/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./services/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2563EB',
          hover: '#1D4ED8',
        },
        accent: {
          green: '#059669',
          red: '#DC2626',
          amber: '#D97706',
        },
        surface: '#FFFFFF',
        'app-bg': '#F8FAFC',
        border: '#E4ECFC',
        muted: '#F1F5FD',
        'text-base': '#0F172A',
        'text-muted': '#64748B',
      },
      fontFamily: {
        heading: ['Figtree', 'sans-serif'],
        body: ['Noto Sans', 'sans-serif'],
      },
      fontSize: {
        'data': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'label': ['13px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      spacing: {
        'sidebar': '240px',
        'sidebar-collapsed': '64px',
        'top-bar': '56px',
        'bottom-nav': '64px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px rgba(37,99,235,0.08)',
        'modal': '0 20px 60px rgba(0,0,0,0.15)',
      },
      borderRadius: {
        'card': '8px',
        'btn': '6px',
        'badge': '4px',
      },
      zIndex: {
        'sticky': '10',
        'sidebar': '20',
        'topbar': '30',
        'bottomnav': '40',
        'modal': '50',
        'toast': '60',
      },
    },
  },
  plugins: [],
}

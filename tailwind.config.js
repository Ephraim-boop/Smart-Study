/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'ui-serif', 'Georgia', 'serif'],
      },
      colors: {
        // Brand palette pulled from the StudySmart design.
        brand: {
          teal: '#14b8a6',
          tealDark: '#0d9488',
          navy: '#1e2a44',
          navyDeep: '#16213a',
        },
      },
      boxShadow: {
        card: '0 18px 40px -22px rgba(15,23,42,0.35)',
        glow: '0 24px 70px -24px rgba(37,99,235,0.55)',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Subtle background tiers between 900 and 950 for layered surfaces.
        'neutral-925': '#171717',
        'neutral-975': '#0a0a0a',
      },
    },
  },
  plugins: [],
};

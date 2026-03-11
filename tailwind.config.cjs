/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        bricolage: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        instrument: ['"Instrument Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        'hub-accent': '#ddb96a',
      },
      width: {
        'hub-sidebar': '430px',
      },
    },
  },
  plugins: [],
}

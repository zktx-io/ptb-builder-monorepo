/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontSize: {
        xxs: '0.625rem', // 10px
        xxxs: '0.5rem',
      },
    },
  },
  plugins: [],
};

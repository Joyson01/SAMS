/** @type {import('tailwindcss').Config} */
const token = name => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {
    fontFamily: { sans: ['Inter Variable', 'Inter', 'sans-serif'] },
    colors: {
      muted: token('text-muted'), foreground: token('text'), background: token('background'), surface: token('surface'), 'surface-muted': token('surface-muted'), border: token('border'), text: token('text'), 'text-muted': token('text-muted'), primary: token('primary'), 'primary-foreground': token('primary-foreground'), success: token('success'), warning: token('warning'), danger: token('danger'), info: token('info'),
      slate: Object.fromEntries([50,100,200,300,400,500,600,700,800,900,950].map(n=>[n,token(`slate-${n}`)])),
      brand: Object.fromEntries([50,100,200,300,400,500,600,700,800,900,950].map(n=>[n,token(`indigo-${n}`)])),
      blue: Object.fromEntries([50,100,200,300,400,500,600,700,800,900,950].map(n=>[n,token(`indigo-${n}`)])),
    },
    boxShadow: { 'xs': '0 1px 3px rgb(15 23 42 / .04)', '2xs': '0 1px 2px rgb(15 23 42 / .03)' },
  } }, plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  // 소스가 모두 src/ 아래에 있으므로 거기서 className 을 스캔한다
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};

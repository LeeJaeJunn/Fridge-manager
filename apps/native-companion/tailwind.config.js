/** @type {import('tailwindcss').Config} */
module.exports = {
  // 소스가 모두 src/ 아래에 있으므로 거기서 className 을 스캔한다
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // 따뜻한 파스텔 무드 — "나를 기억하는 AI 친구"
      colors: {
        // 배경/표면
        cream: '#FBF8F4', // 앱 기본 배경 (크림)
        sand: '#F3ECE3', // 살짝 들어간 표면 (입력창 등)
        // 텍스트 (따뜻한 차콜)
        ink: {
          DEFAULT: '#3D3A4E', // 본문/제목
          soft: '#6F6A82', // 보조 텍스트
          faint: '#A8A2B8', // 흐린 텍스트/플레이스홀더
        },
        // 메인 포인트 (라벤더)
        lavender: {
          DEFAULT: '#A78BFA',
          deep: '#8B6FE8', // 눌림/강조
          soft: '#EDE9FE', // 옅은 배경
        },
        // 보조 포인트
        peach: { DEFAULT: '#FBBF8F', soft: '#FEEEE0' },
        blush: { DEFAULT: '#F9A8D4', soft: '#FDE7F3' },
      },
      borderRadius: {
        '4xl': '32px',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  // 소스가 모두 src/ 아래에 있으므로 거기서 className 을 스캔한다
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // 클린 무드 — 흰 배경 + 쿨 그레이 중립. 포인트는 라벤더.
      colors: {
        // 배경/표면
        cream: '#FFFFFF', // 앱 기본 배경 (흰색) — 토큰명은 유지(전 화면 자동 반영)
        sand: '#F4F4F5', // 살짝 들어간 표면 (입력창·비선택 칩·회색 말풍선)
        line: '#E9E9EC', // 보더/구분선 (흰 배경 위 카드·디바이더)
        // 텍스트 (쿨 뉴트럴)
        ink: {
          DEFAULT: '#27272A', // 본문/제목
          soft: '#6E6E78', // 보조 텍스트
          faint: '#A1A1AA', // 흐린 텍스트/플레이스홀더
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
        // 카테고리 틴트 (메모리 아이콘 등 의미별 파스텔) — soft=배경, deep=글리프
        mint: { deep: '#34D399', soft: '#DCFCE7' },
        sky: { deep: '#38BDF8', soft: '#E0F2FE' },
        amber: { deep: '#F59E0B', soft: '#FEF3C7' },
      },
      borderRadius: {
        '4xl': '32px',
      },
    },
  },
  plugins: [],
};

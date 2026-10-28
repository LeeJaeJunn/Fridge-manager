/** @type {import('tailwindcss').Config} */
module.exports = {
  // 소스가 모두 src/ 아래에 있으므로 거기서 className 을 스캔한다
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // 따뜻한 뉴트럴 무드 — 웜그레이 캔버스 + 흰 카드. 포인트는 로즈 코랄.
      colors: {
        // 배경/표면 (3단 엘리베이션: 캔버스 < 흰 카드 / sand=들어가거나 독립된 회색면)
        cream: '#FAF8F6', // 앱 기본 배경 (따뜻한 뉴트럴 캔버스) — 흰 카드가 이 위에서 떠 보인다. 토큰명은 유지(전 화면 자동 반영)
        sand: '#F4F0ED', // 들어간/독립 회색 표면 (입력창·비선택 칩·회색 말풍선)
        line: '#EAE1DD', // 보더/구분선 (카드·디바이더·칩 테두리)
        // 텍스트 (웜 뉴트럴)
        ink: {
          DEFAULT: '#2B2726', // 본문/제목
          soft: '#716865', // 보조 텍스트
          faint: '#A79C98', // 흐린 텍스트/플레이스홀더
        },
        // 메인 포인트 (로즈 코랄 — 음식의 온기와 컴패니언의 친근함)
        primary: {
          DEFAULT: '#C94B55',
          deep: '#B83E49', // 눌림/강조
          soft: '#FDE8EA', // 옅은 배경
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

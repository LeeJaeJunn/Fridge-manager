import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  type ImageSourcePropType,
  type PressableProps,
  Text,
  type View,
} from 'react-native';

/**
 * 두 축이 한 이름에 섞여 있다:
 *  - `primary`/`secondary`/`danger` = **강조 정도**(우리 디자인 시스템)
 *  - `kakao` 등 = **브랜드**(그쪽 자산)
 *
 * 굳이 합친 이유는 소셜 로그인 버튼이 우리 버튼과 **여백·글꼴·모서리가 완전히 같아서**다.
 * 따로 만들면 크기를 한쪽만 바꿨을 때 나란히 선 두 버튼이 어긋나는데, 그게 실제로 겪은 문제다.
 */
type Variant = 'primary' | 'secondary' | 'danger' | 'kakao';
type Size = 'md' | 'sm';
type Radius = 'full' | 'soft';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  /** md(기본) = 큰 버튼, sm = 헤더·인라인용 작은 버튼 */
  size?: Size;
  /**
   * 모서리 (기본 `full` = 알약). `Card` 의 `radius` 와 같은 자리다.
   *
   * `soft`(5px)는 **소셜 로그인 버튼과 나란히 설 때** 쓴다 — 그쪽은 배포 자산의 모서리를
   * 따라야 해서 알약으로 못 만들고, 옆 버튼만 알약이면 둘이 따로 논다.
   */
  radius?: Radius;
  /** 라벨 왼쪽 아이콘 (소셜 심볼 등). 정사각 박스에 `contain` 이라 비율이 안 찌그러진다 */
  icon?: ImageSourcePropType;
  /** 진행 중이면 라벨 대신 스피너 (자동으로 비활성화) */
  loading?: boolean;
};

const SIZES: Record<Size, { box: string; text: string; icon: number; gap: string }> = {
  md: { box: 'px-6 py-4', text: 'text-base', icon: 18, gap: 'gap-2' },
  sm: { box: 'px-4 py-2', text: 'text-sm', icon: 16, gap: 'gap-1.5' },
};

// 5px 은 Tailwind 기본 스케일에 없어서 임의값으로 준다 — 카카오 자산 실측치라
// 가까운 `rounded-md`(6px)로 반올림하면 나란히 놨을 때 미묘하게 어긋난다.
const RADIUS: Record<Radius, string> = { full: 'rounded-full', soft: 'rounded-[5px]' };

// 변종별 스타일 — 색을 바꿀 땐 여기 + tailwind 토큰만 고치면 된다.
const VARIANTS: Record<Variant, { box: string; boxOff: string; text: string; spinner: string }> = {
  primary: {
    box: 'bg-primary active:bg-primary-deep',
    boxOff: 'bg-primary/40',
    text: 'text-white',
    spinner: '#ffffff',
  },
  secondary: {
    box: 'bg-white border border-line active:bg-sand',
    boxOff: 'opacity-50',
    text: 'text-ink',
    spinner: '#716865',
  },
  danger: {
    box: 'border border-red-500 active:bg-red-50',
    boxOff: 'opacity-50',
    text: 'text-red-600',
    spinner: '#DC2626',
  },
  /**
   * 카카오 로그인 — 컨테이너 `#FEE500`, 라벨 검정 85%. 디자인 가이드가 지정한 값이다.
   * https://developers.kakao.com/docs/ko/kakaologin/design-guide
   *
   * ⚠️ **이 색은 `tailwind.config.js` 에 넣지 않는다.** 거기 넣으면 우리 팔레트인 것처럼 보이고
   * 다른 화면에서 쓰이게 된다 — 카카오 자산이지 우리 색이 아니다. 그래서 여기만 임의값을 쓴다.
   */
  kakao: {
    box: 'bg-[#FEE500] active:opacity-90',
    boxOff: 'bg-[#FEE500] opacity-50',
    text: 'text-black/85',
    spinner: '#000000',
  },
};

/**
 * 공통 버튼. `<Link asChild>` 안에서도 쓸 수 있도록 ref·press 핸들러를
 * 그대로 Pressable 로 넘긴다.
 *
 * 소셜 로그인 버튼도 이걸 쓴다 — 브랜드마다 다른 건 **컨테이너 색·라벨 색·심볼뿐**이고
 * 나머지(여백·글꼴·모서리·비활성·스피너)는 전부 같다. 네이버·구글을 붙일 땐 위 `VARIANTS` 에
 * 한 줄씩 늘리면 된다.
 */
export const Button = forwardRef<View, Props>(function Button(
  {
    label,
    variant = 'primary',
    size = 'md',
    radius = 'full',
    icon,
    loading = false,
    disabled,
    className = '',
    ...rest
  },
  ref,
) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const off = disabled || loading;
  return (
    <Pressable
      ref={ref}
      disabled={off}
      className={`flex-row items-center justify-center ${s.gap} ${RADIUS[radius]} ${s.box} ${
        off ? v.boxOff : v.box
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <>
          {/* 정사각 박스 + `contain` — 심볼이 정사각이 아닌 경우(카카오는 652×600)에도 안 찌그러진다 */}
          {icon && (
            <Image source={icon} resizeMode="contain" style={{ width: s.icon, height: s.icon }} />
          )}
          <Text className={`font-semibold ${s.text} ${v.text}`}>{label}</Text>
        </>
      )}
    </Pressable>
  );
});

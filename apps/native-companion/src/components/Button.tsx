import { forwardRef } from 'react';
import { ActivityIndicator, Pressable, type PressableProps, Text, type View } from 'react-native';

type Variant = 'primary' | 'secondary' | 'danger';
type Size = 'md' | 'sm';

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  /** md(기본) = 큰 버튼, sm = 헤더·인라인용 작은 버튼 */
  size?: Size;
  /** 진행 중이면 라벨 대신 스피너 (자동으로 비활성화) */
  loading?: boolean;
};

const SIZES: Record<Size, { box: string; text: string }> = {
  md: { box: 'px-6 py-4', text: 'text-base' },
  sm: { box: 'px-4 py-2', text: 'text-sm' },
};

// 변종별 스타일 — 색을 바꿀 땐 여기 + tailwind 토큰만 고치면 된다.
const VARIANTS: Record<
  Variant,
  { box: string; boxOff: string; text: string; spinner: string }
> = {
  primary: {
    box: 'bg-lavender active:bg-lavender-deep',
    boxOff: 'bg-lavender/40',
    text: 'text-white',
    spinner: '#ffffff',
  },
  secondary: {
    box: 'bg-white border border-line active:bg-sand',
    boxOff: 'opacity-50',
    text: 'text-ink',
    spinner: '#6E6E78',
  },
  danger: {
    box: 'border border-blush active:bg-blush-soft',
    boxOff: 'opacity-50',
    text: 'text-blush',
    spinner: '#F9A8D4',
  },
};

/**
 * 공통 버튼. `<Link asChild>` 안에서도 쓸 수 있도록 ref·press 핸들러를
 * 그대로 Pressable 로 넘긴다.
 */
export const Button = forwardRef<View, Props>(function Button(
  {
    label,
    variant = 'primary',
    size = 'md',
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
      className={`flex-row items-center justify-center rounded-full ${s.box} ${
        off ? v.boxOff : v.box
      } ${className}`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} />
      ) : (
        <Text className={`font-semibold ${s.text} ${v.text}`}>{label}</Text>
      )}
    </Pressable>
  );
});

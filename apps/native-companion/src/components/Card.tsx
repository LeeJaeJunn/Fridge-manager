import { forwardRef, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, View, type ViewStyle } from 'react-native';

type Props = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  /** 부드러운 라벤더 그림자를 띄운다 (히어로 카드 등) */
  elevated?: boolean;
  /** 모서리 둥글기 (기본 4xl) */
  radius?: '2xl' | '3xl' | '4xl';
  style?: StyleProp<ViewStyle>;
};

const RADIUS = {
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  '4xl': 'rounded-4xl',
} as const;

// 그림자는 className 으로 표현이 어려워 style 로 한 곳에 모아둔다.
const SHADOW = {
  shadowColor: '#2B2726',
  shadowOpacity: 0.07,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
} as const;

/**
 * 흰 표면 카드. `onPress` 가 있으면 누를 수 있는 카드(Pressable),
 * 없으면 단순 표면(View) 으로 렌더링된다.
 */
export const Card = forwardRef<View, Props>(function Card(
  { children, elevated = false, radius = '4xl', onPress, className = '', style, ...rest },
  ref,
) {
  const cls = `${RADIUS[radius]} border border-line bg-white ${className}`;
  const mergedStyle = elevated ? [SHADOW, style] : style;

  if (onPress) {
    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        className={`${cls} active:bg-sand`}
        style={mergedStyle}
        {...rest}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View ref={ref} className={cls} style={mergedStyle}>
      {children}
    </View>
  );
});

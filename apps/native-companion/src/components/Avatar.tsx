import { Text, View } from 'react-native';

type Props = {
  /** 캐릭터 이름 — 첫 글자를 원 안에 보여준다 */
  name: string;
  /** 지름(px). 기본 96 */
  size?: number;
};

/** 라벤더 원형 아바타 — 이름 첫 글자. 아직 이미지는 없으므로 이니셜로 표현. */
export function Avatar({ name, size = 96 }: Props) {
  const initial = name.trim().charAt(0) || '🙂';
  return (
    <View
      className="items-center justify-center rounded-full bg-lavender-soft"
      style={{ width: size, height: size }}
    >
      <Text className="font-bold text-lavender-deep" style={{ fontSize: size * 0.42 }}>
        {initial}
      </Text>
    </View>
  );
}

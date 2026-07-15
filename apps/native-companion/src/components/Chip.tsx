import { Pressable, Text } from 'react-native';

type Props = {
  label: string;
  selected?: boolean;
  /** 최대 선택 개수가 차서 더 못 고르는 상태 (선택된 칩은 잠기지 않는다) */
  disabled?: boolean;
  onPress: () => void;
};

/**
 * 선택형 칩 — 온보딩/설정의 성별·관계·말투·성격·관심사 선택에 쓴다.
 * 색은 토큰만 쓴다(선택=lavender, 비선택=sand). 보통 ChipGroup 을 통해 쓴다.
 */
export function Chip({ label, selected = false, disabled = false, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-full border px-4 py-2 ${
        selected ? 'border-lavender bg-lavender-soft' : 'border-line bg-sand active:bg-line'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <Text className={`text-sm ${selected ? 'font-semibold text-lavender-deep' : 'text-ink'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

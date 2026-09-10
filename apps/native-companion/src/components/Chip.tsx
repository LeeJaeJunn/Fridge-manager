import { Pressable, Text } from 'react-native';

/** 크기 축 — `Button` 과 같은 방식(강조/크기를 따로 둔다). 색은 어느 크기에서도 같다. */
const SIZES = {
  md: { box: 'px-4 py-2', text: 'text-sm' },
  sm: { box: 'px-3 py-2', text: 'text-xs' },
} as const;

type Props = {
  label: string;
  selected?: boolean;
  /** 최대 선택 개수가 차서 더 못 고르는 상태 (선택된 칩은 잠기지 않는다) */
  disabled?: boolean;
  /**
   * `md`(기본) = 온보딩·설정처럼 칩이 화면의 주인공일 때.
   * `sm` = **라벨과 같은 줄에 들어가야 할 때**(재료 폼의 보관 선택). 좁은 모달 안에서
   * `md` 로 두면 칩 3개가 라벨과 한 줄에 안 들어가 줄바꿈된다.
   */
  size?: keyof typeof SIZES;
  onPress: () => void;
};

/**
 * 선택형 칩 — 온보딩/설정의 말투·관심사 선택, 재료 폼의 분류·보관 선택에 쓴다.
 * 색은 토큰만 쓴다. 보통 ChipGroup 을 통해 쓴다.
 *
 * 모서리는 알약(`rounded-full`)이 아니라 `rounded-xl` 이다 — 알약은 칩이 화면의 주인공일 때는
 * 좋지만, 재료 폼처럼 사각 박스 안에 줄줄이 들어가면 박스와 리듬이 어긋난다.
 */
export function Chip({ label, selected = false, disabled = false, size = 'md', onPress }: Props) {
  const s = SIZES[size];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`rounded-xl border ${s.box} ${
        selected ? 'border-lavender bg-lavender-soft' : 'border-line bg-sand active:bg-line'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <Text className={`${s.text} ${selected ? 'font-semibold text-lavender-deep' : 'text-ink'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

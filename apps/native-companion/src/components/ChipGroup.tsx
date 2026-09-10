import { View } from 'react-native';
import { Chip } from './Chip';

export type ChipOption = { value: string; label: string };

type Base = {
  options: ChipOption[];
  className?: string;
  /** 칩 크기 — 라벨과 같은 줄에 넣어야 하면 `sm` (Chip 주석 참고) */
  size?: 'md' | 'sm';
};

/** 단일선택 — 말투 */
type SingleProps = Base & {
  value: string | null;
  onChange: (value: string) => void;
  values?: never;
  max?: never;
};

/** 다중선택 — 성격·관심사 */
type MultiProps = Base & {
  values: string[];
  onChange: (values: string[]) => void;
  /** 최대 선택 개수 — 다 차면 미선택 칩만 비활성된다 */
  max?: number;
  value?: never;
};

type Props = SingleProps | MultiProps;

/** values 가 배열이면 다중선택 모드 (Array.isArray 로 좁혀야 TS 가 분기를 인식한다) */
const isMulti = (p: Props): p is MultiProps => Array.isArray(p.values);

/**
 * 칩 선택 그룹 — 단일선택(`value`)과 다중선택(`values`) 겸용.
 * 온보딩 4스텝의 선택 UI 대부분이 이걸 쓴다.
 */
export function ChipGroup(props: Props) {
  const { options, className = '', size } = props;

  const selected = isMulti(props) ? props.values : props.value ? [props.value] : [];
  // 최대치에 도달하면 아직 안 고른 칩만 잠근다(고른 칩은 해제할 수 있어야 하므로).
  const full = isMulti(props) && Boolean(props.max) && props.values.length >= Number(props.max);

  const toggle = (value: string) => {
    if (isMulti(props)) {
      const next = props.values.includes(value)
        ? props.values.filter((v) => v !== value)
        : [...props.values, value];
      props.onChange(next);
      return;
    }
    props.onChange(value);
  };

  return (
    <View className={`flex-row flex-wrap gap-2 ${className}`}>
      {options.map((o) => {
        const isSelected = selected.includes(o.value);
        return (
          <Chip
            key={o.value}
            label={o.label}
            selected={isSelected}
            disabled={full && !isSelected}
            size={size}
            onPress={() => toggle(o.value)}
          />
        );
      })}
    </View>
  );
}

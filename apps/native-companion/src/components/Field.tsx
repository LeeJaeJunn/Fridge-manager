import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

type Props = {
  label: string;
  /** 보조 안내 (글자수 카운터 등). error 가 있으면 대신 error 를 보여준다 */
  hint?: string;
  /** 있으면 hint 대신 빨갛게 — 그 자리에서 뭐가 틀렸는지 알려주기 위함 */
  error?: string;
  children: ReactNode;
};

/** 폼 필드 한 칸 — 라벨 + 입력 + (hint/error). 온보딩·캐릭터 설정 폼이 공유한다. */
export function Field({ label, hint, error, children }: Props) {
  return (
    <View className="gap-2">
      <Text className="text-sm font-medium text-ink">{label}</Text>
      {children}
      {error ? (
        <Text className="text-xs text-red-500">{error}</Text>
      ) : hint ? (
        <Text className="text-xs text-ink-faint">{hint}</Text>
      ) : null}
    </View>
  );
}

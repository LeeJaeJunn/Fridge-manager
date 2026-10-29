import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
  /** 스크롤 가능한 화면이면 true (홈·목록 등) */
  scroll?: boolean;
  /** SafeArea 적용 가장자리 (기본: 상단만) */
  edges?: Edge[];
  /** 본문 컨테이너에 덧붙일 클래스 */
  contentClassName?: string;
};

/**
 * 모든 화면의 공통 바깥 래퍼 — 크림 배경 + SafeArea를 한 곳에서 관리한다.
 * 세로 스크롤은 Android에서 `overScrollMode="always"` — 내용이 짧아도 끝에서 늘어나는 탄성을 준다.
 * `grow` 로 본문이 화면 높이를 채워 `justify-center`·`mt-auto` 배치를 스크롤 화면에서도 쓸 수 있다.
 */
export function Screen({
  children,
  scroll = false,
  edges = ['top'],
  contentClassName = '',
}: Props) {
  return (
    <SafeAreaView className="flex-1 bg-cream" edges={edges}>
      {scroll ? (
        <ScrollView
          overScrollMode="always"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName={`grow ${contentClassName}`}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 ${contentClassName}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}

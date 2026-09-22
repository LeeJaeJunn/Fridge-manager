import { Text, View } from 'react-native';

import { Screen } from '@/components';

/** 저장한 요리 목록 — 화면 틀만 잡아둔 상태. 목록 연동은 다음 작업. */
export default function SavedDishesScreen() {
  return (
    <Screen>
      <View className="flex-row items-center px-6 py-4">
        <Text className="text-xl font-bold text-ink">저장한 요리</Text>
      </View>
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-ink-faint">저장한 요리를 곧 여기서 볼 수 있어요.</Text>
      </View>
    </Screen>
  );
}

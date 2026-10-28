import { useRouter } from 'expo-router';
import { ActivityIndicator } from 'react-native';

import { IngredientForm, Screen, toAddInput } from '@/components';
import { useInventory } from '@/context/inventory';

/**
 * 재료 직접 추가 화면 — 냉장고 헤더 + → "직접 입력" 에서 모달로 올라온다.
 * 재고는 전역 컨텍스트라 여기서 add 를 바로 호출하고, 저장/취소 후 모달을 닫는다(router.back).
 * (사진·영수증 인식도 나중에 각자 이런 전용 화면으로 붙는다 — 방법 선택 시트가 라우터.)
 */
export default function AddIngredientScreen() {
  const router = useRouter();
  const { options, add } = useInventory();

  // options 없이는 분류·보관 칩을 못 그린다 — 세션 초반 극히 짧은 순간만 해당.
  if (!options) {
    return (
      <Screen edges={[]} contentClassName="flex-1 items-center justify-center">
        <ActivityIndicator color="#C94B55" />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom']} contentClassName="gap-4 px-6 py-6">
      <IngredientForm
        options={options}
        submitLabel="추가"
        onCancel={() => router.back()}
        onSubmit={async (v) => {
          await add([toAddInput(v)]);
          router.back();
        }}
      />
    </Screen>
  );
}

import { Text, View } from 'react-native';

import type { DishIngredientType, DishProposalType } from '@companion/types';
import { Card } from './Card';

/**
 * 재료 한 줄. **있는 것과 없는 것을 눈에 띄게 가르는 게 이 카드의 존재 이유 절반**이다 —
 * 예전엔 부족한 재료가 말풍선 문장 속에 묻혀 있어서 "뭘 사야 하지"가 한눈에 안 보였다.
 */
function IngredientRow({ item }: { item: DishIngredientType }) {
  const have = item.ingredientId !== null;
  return (
    <View className="flex-row items-baseline gap-2 py-1">
      <Text className={have ? 'text-xs text-lavender' : 'text-xs text-ink-faint'}>
        {have ? '✓' : '＋'}
      </Text>
      <Text className={`flex-1 text-[15px] ${have ? 'text-ink' : 'text-ink-soft'}`}>
        {item.name}
      </Text>
      <Text className="text-sm text-ink-soft">{item.amount}</Text>
      {/* 냉장고에 얼마나 있는지를 함께 보여준다 — "200g 쓰는데 1kg 있네"가 바로 읽힌다.
          없는 재료는 이 자리에 "사야 해요"가 온다(수량이 없으니 빈칸으로 두면 안 읽힌다). */}
      <Text className="w-24 text-right text-xs text-ink-faint">
        {have ? (item.currentQuantityNote ?? '있음') : '사야 해요'}
      </Text>
    </View>
  );
}

/**
 * 요리 제안 카드 — `propose_dish` 호출을 그린다.
 *
 * **`FUNCTION_CALL` 에 그린다**(레시피 검색과 다르다). 서버가 재고 매칭까지 끝내 `resolved` 에
 * 담아두므로 결과 아이템(`{ shown: true }`)은 화면에 아무것도 만들지 않는다.
 *
 * 요리가 정해진 순간을 카드로 굳히는 게 목적이다 — 예전엔 추천이 말풍선 텍스트로만 남아서
 * 저장할 수도, 나중에 "다 만들었어" 할 때 무엇을 썼는지 알 수도 없었다.
 */
export function DishCard({ dish }: { dish: DishProposalType }) {
  const missing = dish.ingredients.filter((i) => i.ingredientId === null).length;

  return (
    <Card radius="3xl" className="gap-3 px-5 py-4">
      <View className="gap-0.5">
        <Text className="text-base font-bold text-ink">🍲 {dish.dishName}</Text>
        <Text className="text-xs text-ink-faint">
          {dish.servings}인분
          {dish.cookMinutes ? ` · 약 ${dish.cookMinutes}분` : ''}
        </Text>
      </View>

      <View>
        <Text className="pb-1 text-sm font-semibold text-ink-soft">재료</Text>
        {dish.ingredients.map((item) => (
          // 서버가 같은 재료를 한 번만 담으므로(resolveDishIngredients 의 dedupe) 이름이 키로 안전하다.
          <IngredientRow key={item.name} item={item} />
        ))}
        {/* 색은 `amber.deep`(주의 틴트) — `peach` 는 흰 카드 위에서 대비가 너무 낮다 */}
        {missing > 0 && (
          <Text className="pt-1 text-xs text-amber-deep">{missing}가지만 사면 돼요</Text>
        )}
      </View>

      {dish.steps.length > 0 && (
        <View>
          <Text className="pb-1 text-sm font-semibold text-ink-soft">만드는 법</Text>
          {dish.steps.map((step, i) => (
            // 순서는 배열 그 자체라 index 가 곧 정체성이다(재정렬·삭제가 없다).
            <View key={i} className="flex-row gap-2 py-0.5">
              <Text className="text-sm text-ink-faint">{i + 1}.</Text>
              <Text className="flex-1 text-[15px] leading-5 text-ink">{step}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

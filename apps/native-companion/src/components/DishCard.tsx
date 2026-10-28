import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import type { DishIngredientType, DishProposalType } from '@companion/types';
import { Button } from './Button';
import { Card } from './Card';

const STAR_ON = '#F59E0B'; // amber-deep — 저장 상태는 브랜드색보다 금색 별이 즉시 읽힌다.
const STAR_OFF = '#A79C98'; // ink-faint
// Ionicons 는 className 으로 색을 못 받으므로 디자인 토큰 값을 직접 넘긴다.

/**
 * 재료 한 줄. **있는 것과 없는 것을 눈에 띄게 가르는 게 이 카드의 존재 이유 절반**이다 —
 * 예전엔 부족한 재료가 말풍선 문장 속에 묻혀 있어서 "뭘 사야 하지"가 한눈에 안 보였다.
 */
function IngredientRow({ item }: { item: DishIngredientType }) {
  const have = item.ingredientId !== null;
  return (
    <View className="flex-row items-baseline gap-2 py-1">
      <Text className={have ? 'text-xs text-emerald-700' : 'text-xs text-ink-faint'}>
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

/** "8/29" — 카드 한 줄짜리 표시라 연도까지 쓸 이유가 없다. */
function formatCooked(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
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
export function DishCard({
  dish,
  onSearchRecipes,
  onCook,
  saved,
  onPressStar,
  canSearch,
  searching,
  cooking,
}: {
  dish: DishProposalType;
  onSearchRecipes: () => void;
  onCook: () => void;
  saved: boolean;
  onPressStar: () => void;
  /** 소비 제안을 불러오는 중 (전용 LLM 호출이 끼어 1초쯤 걸린다) */
  cooking?: boolean;
  /**
   * 버튼을 아직 열어둘지. **화면이 정하지 않고 대화 상태에서 파생돼 내려온다** —
   * 이미 검색했거나 대화가 그 뒤로 넘어갔으면 false 다(`[id].tsx` 참고).
   */
  canSearch: boolean;
  /** 검색 중 — 버튼을 잠가 중복 호출(=네이버 쿼터 낭비)을 막는다 */
  searching?: boolean;
}) {
  const missing = dish.ingredients.filter((i) => i.ingredientId === null).length;

  return (
    <Card radius="3xl" className="gap-3 px-5 py-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-bold text-ink">🍲 {dish.dishName}</Text>
          <Text className="text-xs text-ink-faint">
            {dish.servings}인분
            {dish.cookMinutes ? ` · 약 ${dish.cookMinutes}분` : ''}
          </Text>
        </View>
        <Pressable
          onPress={onPressStar}
          hitSlop={8}
          accessibilityLabel={saved ? '저장한 요리 보기' : '레시피 저장'}
        >
          <Ionicons
            name={saved ? 'star' : 'star-outline'}
            size={22}
            color={saved ? STAR_ON : STAR_OFF}
          />
        </Pressable>
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

      {/* 두 버튼의 **수명이 다르다**:
          - 레시피 검색 = "지금 궁금한 것" → 검색했거나 대화가 넘어가면 감춘다
          - 만들었어요   = "나중에 할 일"   → 실제로 만들 때까지 남는다
          쓸 수 없게 되면 비활성 버튼이 아니라 **감춘다** — 지난 카드에 회색 버튼이 줄줄이 남으면
          "왜 못 누르지"만 남고 스크롤할 때 시선만 잡아먹는다. */}
      {(canSearch || !dish.cookedAt) && (
        <View className="flex-row gap-2">
          {canSearch && (
            <View className="flex-1">
              <Button
                label="자세한 레시피"
                variant="secondary"
                size="sm"
                loading={searching}
                onPress={onSearchRecipes}
              />
            </View>
          )}
          {/* primary 인 건 이 카드의 목적지가 "요리를 하는 것"이라서다. 검색은 곁길이다. */}
          {!dish.cookedAt && (
            <View className="flex-1">
              <Button label="만들었어요" size="sm" loading={cooking} onPress={onCook} />
            </View>
          )}
        </View>
      )}

      {/* 이미 반영했으면 그 사실을 남긴다 — 버튼만 사라지면 "내가 눌렀던가?"가 된다.
          소비는 대화에 아무 아이템도 안 남기므로(토큰 때문), 여기가 유일한 흔적이다. */}
      {dish.cookedAt && (
        <Text className="text-xs text-ink-faint">
          ✓ {formatCooked(dish.cookedAt)} 재고에 반영했어요
        </Text>
      )}
    </Card>
  );
}

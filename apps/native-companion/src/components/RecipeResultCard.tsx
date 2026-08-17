import { Linking, Pressable, Text, View } from 'react-native';

import type { RecipeResultType } from '@/lib/messages';
import type { RecipeType } from '@companion/types';
import { Card } from './Card';

/**
 * 레시피 링크 한 줄. 누르면 **외부 브라우저로 나간다**(웹뷰가 아니다) —
 * v1.1 이 검증하려는 건 "검색으로 붙인 상세 레시피가 쓸모 있나"이고, 웹뷰냐 링크냐는 그 답을
 * 바꾸지 않는다. 네이버 블로그·레시피 사이트는 자체 리다이렉트·모바일 페이지가 있어 임베디드
 * 웹뷰에서 깨지는 경우가 흔하다. 이탈이 실제로 관측되면 그때 웹뷰로 승격한다.
 */
function RecipeRow({ recipe }: { recipe: RecipeType }) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(recipe.url)}
      className="gap-0.5 rounded-2xl px-1 py-2 active:bg-sand"
    >
      <Text numberOfLines={2} className="text-[15px] font-medium text-ink">
        {recipe.title}
      </Text>
      {recipe.summary ? (
        <Text numberOfLines={2} className="text-xs leading-4 text-ink-soft">
          {recipe.summary}
        </Text>
      ) : null}
      {/* 출처를 항상 드러낸다 — 우리가 검증한 레시피가 아니라 외부 글이라는 표시다. */}
      <Text className="text-xs text-ink-faint">
        {recipe.sourceDomain || '외부 링크'}
        {recipe.author ? ` · ${recipe.author}` : ''}
      </Text>
    </Pressable>
  );
}

/**
 * 레시피 검색 결과 블록 — 한 번의 `search_recipes` 결과를 **카드 하나**로 묶는다.
 *
 * 개별 카드 여러 장이 아니라 그룹 블록인 이유:
 *  - 채팅은 스크롤 스트림이라 5장을 각각 카드로 띄우면 화면을 통째로 잡아먹는다
 *  - 헤더("○○ 레시피 N개를 찾았어요")가 **모델이 말을 안 한 턴을 비지 않게** 채운다.
 *    서버가 툴만 부르고 텍스트를 안 내는 경우가 실제로 관측됐고, 그때 이 헤더가 없으면
 *    사용자에겐 "보냈는데 아무 반응 없음"으로 보인다.
 *  - 실패·0건도 같은 블록이 문구만 바꿔 처리한다(칩 + 카드로 쪼개면 "검색했어요" 다음에
 *    실패 블록이 오는 어색한 조합이 생긴다)
 */
export function RecipeResultCard({ result }: { result: RecipeResultType }) {
  const { dishName, recipes, reason } = result;
  const dish = dishName || '레시피';

  if (recipes.length === 0) {
    // 검색 실패와 0건은 사용자에게 다른 사실이다 — 실패는 다시 해볼 여지가 있다.
    const message =
      reason === 'unavailable'
        ? `지금은 ${dish} 레시피를 가져오지 못했어요. 잠시 뒤에 다시 부탁해 주세요.`
        : `${dish} 레시피를 찾지 못했어요.`;
    return (
      <Card radius="3xl" className="px-5 py-4">
        <Text className="text-sm text-ink-soft">{message}</Text>
      </Card>
    );
  }

  return (
    <Card radius="3xl" className="gap-1 px-4 py-4">
      <Text className="px-1 text-sm font-bold text-ink">
        🔍 {dish} 레시피 {recipes.length}개를 찾았어요
      </Text>
      <View className="gap-0.5">
        {recipes.map((r) => (
          <RecipeRow key={r.url} recipe={r} />
        ))}
      </View>
      <Text className="px-1 pt-1 text-xs text-ink-faint">눌러서 원문을 볼 수 있어요</Text>
    </Card>
  );
}

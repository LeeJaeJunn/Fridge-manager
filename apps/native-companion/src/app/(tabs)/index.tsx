import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fetchConversations } from '@/api/conversation';
import { Avatar, Card, Screen } from '@/components';
import { useAuth } from '@/context/auth';
import { useCharacter } from '@/context/character';
import { useInventory } from '@/context/inventory';
import { expiryLabel, freshness, FRESHNESS_STYLE, summarize } from '@/lib/expiry';
import type { ConversationSummaryType, IngredientType } from '@companion/types';

/** 시간대에 맞춘 인사 */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '늦은 밤이네요';
  if (h < 12) return '좋은 아침이에요';
  if (h < 18) return '좋은 오후예요';
  return '좋은 저녁이에요';
}

// 홈에서 바로 대화를 시작할 수 있는 가벼운 시작 문구들 (요리 중심)
const PROMPTS = ['오늘 뭐 해먹지?', '장 보고 왔어', '냉장고 털어줘'];

// 현황 카드 타일 — key 는 summarize() 결과 필드와 맞춘다. 색은 급함 정도(peach→amber→mint→중립).
//
// `미설정` 은 **유통기한을 안 넣은 재료**다. 미설정이 기본값이라 보통 이 숫자가 제일 크다.
// `여유` 에 합치지 않는 이유는 `summarize` 주석 참고 — "모른다"를 "여유 있다"로 말하지 않는다.
// 색을 안 주는 것도 의도다: 급함의 정도가 아니라 정보가 없다는 뜻이라 같은 축에 놓으면 안 된다.
const STATUS_TILES = [
  { key: 'today', label: '오늘까지', color: 'text-peach' },
  { key: 'week', label: '이번주', color: 'text-amber-deep' },
  { key: 'rest', label: '여유', color: 'text-mint-deep' },
  { key: 'unset', label: '미설정', color: 'text-ink-soft' },
] as const;

/** "냉장고 현황" — 전체 재고를 한눈에. 인사 바로 아래에서 앱을 연 순간 상태를 잡아준다. */
function FridgeStatus({ items, isLoading }: { items: IngredientType[]; isLoading: boolean }) {
  const summary = summarize(items);
  const showEmpty = !isLoading && summary.total === 0;

  return (
    <Card radius="3xl" className="gap-4 px-5 py-4">
      <View className="gap-0.5">
        <Text className="text-base font-bold text-ink">🧊 냉장고 현황</Text>
        <Text className="text-sm text-ink-soft">
          {isLoading ? '불러오는 중…' : `총 ${summary.total}개 보관 중`}
        </Text>
      </View>

      {showEmpty ? (
        <View className="gap-1 py-1">
          <Text className="text-[15px] text-ink">아직 등록된 재료가 없어요</Text>
          <Text className="text-sm text-ink-faint">채팅으로 “계란 샀어”처럼 알려주세요</Text>
        </View>
      ) : (
        <View className="flex-row">
          {STATUS_TILES.map((tile, i) => {
            const n = summary[tile.key];
            const dim = isLoading || n === 0;
            return (
              <View
                key={tile.key}
                className={`flex-1 items-center gap-1 ${i > 0 ? 'border-l border-line' : ''}`}
              >
                <Text className={`text-3xl font-bold ${dim ? 'text-ink-faint' : tile.color}`}>
                  {isLoading ? '–' : n}
                </Text>
                <Text className="text-xs text-ink-soft">{tile.label}</Text>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

/** 최근 대화 시각을 사람 말로 — "방금 / N분 전 / N시간 전 / N일 전 / M월 D일". */
function relativeTime(iso: string, now = Date.now()): string {
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  if (min < 60 * 24 * 7) return `${Math.floor(min / (60 * 24))}일 전`;
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 홈에 보여줄 최근 대화 개수 — 넘치면 "전체 보기"로 넘긴다. */
const RECENT_LIMIT = 3;

/**
 * "최근 대화" — 흰 카드 안에 최근 대화 몇 개를 디바이더로 구분해 담는다.
 * 각 줄을 누르면 그 대화로 바로 들어간다. 대화가 없으면 아예 렌더하지 않는다(호출부에서 가드).
 */
function RecentConversations({ conversations }: { conversations: ConversationSummaryType[] }) {
  const shown = conversations.slice(0, RECENT_LIMIT);
  return (
    <Card radius="3xl" className="px-5 py-4">
      <Text className="mb-1 text-base font-bold text-ink">💬 최근 대화</Text>
      {shown.map((c, i) => (
        <Link key={c.id} href={`/conversation/${c.id}`} asChild>
          <Pressable
            className={`flex-row items-center gap-3 py-3 active:opacity-60 ${
              i > 0 ? 'border-t border-line' : ''
            }`}
          >
            <View className="flex-1 gap-0.5">
              <Text numberOfLines={1} className="text-[15px] text-ink">
                {c.preview ?? '새 대화'}
              </Text>
              <Text className="text-xs text-ink-faint">{relativeTime(c.updatedAt)}</Text>
            </View>
            <Text className="text-lg text-lavender">›</Text>
          </Pressable>
        </Link>
      ))}
      {conversations.length > RECENT_LIMIT ? (
        <Link href="/chat" asChild>
          <Text className="mt-3 text-sm font-medium text-lavender">대화 전체 보기 ›</Text>
        </Link>
      ) : null}
    </Card>
  );
}

/** "먼저 먹어요" — 오늘까지거나 이미 지난 재료. 앱을 열 이유를 만드는 자리라 맨 위에 둔다. */
function NudgeSection({ items }: { items: IngredientType[] }) {
  if (items.length === 0) return null;
  return (
    <Card radius="3xl" className="gap-3 px-5 py-4">
      <Text className="text-base font-bold text-ink">🍅 먼저 먹어요</Text>
      <View className="gap-2">
        {items.slice(0, 5).map((item) => {
          // 이 목록은 `shouldNudge` 가 미설정을 이미 걸러내지만, 타입은 그걸 모른다.
          const level = freshness(item.expiresAt);
          const tint = level ? FRESHNESS_STYLE[level] : null;
          return (
            <View key={item.id} className="flex-row items-center justify-between">
              <Text className="text-[15px] text-ink">
                {item.name}
                {item.quantityNote ? (
                  <Text className="text-ink-faint"> {item.quantityNote}</Text>
                ) : null}
              </Text>
              {tint ? (
                <View className={`rounded-full px-2.5 py-0.5 ${tint.bg}`}>
                  <Text className={`text-xs font-medium ${tint.text}`}>{expiryLabel(item)}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <Link href="/fridge" asChild>
        <Text className="text-sm font-medium text-lavender">냉장고 전체 보기 ›</Text>
      </Link>
    </Card>
  );
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { character } = useCharacter();
  const { items, expiring, isLoading } = useInventory();
  const characterName = character?.name ?? '컴패니언';

  // 최근 대화 — 채팅 후 반영되게 focus 마다 갱신. 홈의 부가 섹션이라 실패해도 조용히 숨긴다.
  const [recents, setRecents] = useState<ConversationSummaryType[]>([]);
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setRecents(await fetchConversations());
        } catch {
          // 인벤토리 loadOptions 와 같은 방침 — 부가 정보라 실패해도 화면은 그대로.
        }
      })();
    }, []),
  );

  return (
    <Screen scroll contentClassName="gap-2 px-6 pb-10 pt-4">
      {/* 인사 */}
      <View className="gap-1">
        {/* 이름이 비어도 "님!" 만 남지 않게 폴백 (profile.tsx 와 같은 방식) */}
        <Text className="text-xl font-bold text-ink">
          안녕하세요, {user?.name ?? user?.email?.split('@')[0] ?? '사용자'}님!
        </Text>
        <Text className="text-bold text-ink-soft">{greeting()}</Text>
      </View>

      {/* 컴패니언 — 슬림한 채팅 바로가기 (캐릭터챗이 아니라 조력자 톤이라 크게 두지 않는다) */}
      <Link href="/chat" asChild>
        <Card onPress={() => {}} className="flex-row items-center gap-3 px-5 py-3.5">
          <Avatar name={characterName} size={44} />
          <View className="flex-1">
            <Text className="text-base font-bold text-ink">{characterName}</Text>
            <Text className="text-xs text-ink-soft">냉장고를 같이 관리해요</Text>
          </View>
          <Text className="text-xl text-lavender">›</Text>
        </Card>
      </Link>

      {/* 냉장고 현황 요약 */}
      <FridgeStatus items={items} isLoading={isLoading} />

      {/* 먼저 먹어야 할 재료 (있을 때만) */}
      <NudgeSection items={expiring} />

      {/* 최근 대화 (있을 때만) */}
      {recents.length > 0 ? <RecentConversations conversations={recents} /> : null}

      {/* 빠른 대화 시작 */}
      <View className="gap-3">
        <Text className="text-sm font-medium text-ink-soft">이런 얘기 어때요?</Text>
        <View className="gap-2.5">
          {PROMPTS.map((p) => (
            <Link key={p} href="/chat" asChild>
              <Card
                onPress={() => {}}
                className="flex-row items-center justify-between rounded-2xl px-5 py-4"
              >
                <Text className="text-base text-ink">{p}</Text>
                <Text className="text-lg text-lavender">›</Text>
              </Card>
            </Link>
          ))}
        </View>
      </View>
    </Screen>
  );
}

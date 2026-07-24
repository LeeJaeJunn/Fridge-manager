import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { Avatar, Button, Card, Screen } from '@/components';
import { useAuth } from '@/context/auth';
import { useCharacter } from '@/context/character';
import { useInventory } from '@/context/inventory';
import { expiryLabel, freshness, FRESHNESS_STYLE } from '@/lib/expiry';
import type { IngredientType } from '@companion/types';

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

/** "먼저 먹어요" — 오늘까지거나 이미 지난 재료. 앱을 열 이유를 만드는 자리라 맨 위에 둔다. */
function NudgeSection({ items }: { items: IngredientType[] }) {
  if (items.length === 0) return null;
  return (
    <Card radius="3xl" className="gap-3 px-5 py-4">
      <Text className="text-base font-bold text-ink">🍅 먼저 먹어요</Text>
      <View className="gap-2">
        {items.slice(0, 5).map((item) => {
          const tint = FRESHNESS_STYLE[freshness(item.expiresAt)];
          return (
            <View key={item.id} className="flex-row items-center justify-between">
              <Text className="text-[15px] text-ink">
                {item.name}
                {item.quantityNote ? (
                  <Text className="text-ink-faint"> {item.quantityNote}</Text>
                ) : null}
              </Text>
              <View className={`rounded-full px-2.5 py-0.5 ${tint.bg}`}>
                <Text className={`text-xs font-medium ${tint.text}`}>{expiryLabel(item)}</Text>
              </View>
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
  const { expiring } = useInventory();
  const characterName = character?.name ?? '컴패니언';

  return (
    <Screen scroll contentClassName="gap-7 px-6 pb-10 pt-4">
      {/* 인사 */}
      <View className="gap-1">
        <Text className="text-3xl font-bold text-ink">안녕하세요, {user?.name}님!</Text>
        <Text className="text-base text-ink-soft">{greeting()}</Text>
      </View>

      {/* 먼저 먹어야 할 재료 (있을 때만) */}
      <NudgeSection items={expiring} />

      {/* 컴패니언 히어로 카드 */}
      <Card elevated className="items-center gap-4 px-6 py-8">
        <Avatar name={characterName} />

        <View className="items-center gap-1">
          <Text className="text-xl font-bold text-ink">{characterName}</Text>
          <View className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full bg-peach" />
            <Text className="text-sm text-ink-soft">냉장고를 같이 관리해요</Text>
          </View>
        </View>

        <Link href="/chat" asChild>
          <Button label="대화하기" className="mt-1 w-full" />
        </Link>
      </Card>

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

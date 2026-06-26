import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { Avatar, Button, Card, Screen } from '@/components';
import { useAuth } from '@/context/auth';
import { useCharacter } from '@/context/character';

/** 시간대에 맞춘 인사 */
function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '늦은 밤이네요';
  if (h < 12) return '좋은 아침이에요';
  if (h < 18) return '좋은 오후예요';
  return '좋은 저녁이에요';
}

// 홈에서 바로 대화를 시작할 수 있는 가벼운 시작 문구들
const PROMPTS = ['오늘 하루 어땠어?', '고민이 있어', '뭐 추천해줘'];

export default function HomeScreen() {
  const { user } = useAuth();
  const { character } = useCharacter();
  const characterName = character?.name ?? '컴패니언';

  return (
    <Screen scroll contentClassName="gap-7 px-6 pb-10 pt-4">
      {/* 인사 */}
      <View className="gap-1">
        <Text className="text-ink text-3xl font-bold">안녕하세요, {user?.name}님!</Text>
        <Text className="text-ink-soft text-base">{greeting()}</Text>
      </View>

      {/* 컴패니언 히어로 카드 */}
      <Card elevated className="items-center gap-4 px-6 py-8">
        <Avatar name={characterName} />

        <View className="items-center gap-1">
          <Text className="text-ink text-xl font-bold">{characterName}</Text>
          <View className="flex-row items-center gap-1.5">
            <View className="bg-peach h-2 w-2 rounded-full" />
            <Text className="text-ink-soft text-sm">당신을 기억하고 있어요</Text>
          </View>
        </View>

        <Link href="/chat" asChild>
          <Button label="대화하기" className="mt-1 w-full" />
        </Link>
      </Card>

      {/* 빠른 대화 시작 */}
      <View className="gap-3">
        <Text className="text-ink-soft text-sm font-medium">이런 얘기 어때요?</Text>
        <View className="gap-2.5">
          {PROMPTS.map((p) => (
            <Link key={p} href="/chat" asChild>
              <Card
                onPress={() => {}}
                className="flex-row items-center justify-between rounded-2xl px-5 py-4"
              >
                <Text className="text-ink text-base">{p}</Text>
                <Text className="text-lavender text-lg">›</Text>
              </Card>
            </Link>
          ))}
        </View>
      </View>
    </Screen>
  );
}

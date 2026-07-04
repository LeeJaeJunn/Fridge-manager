import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { deleteMemory, fetchMemories } from '@/api/memory';
import { Card, Screen } from '@/components';
import type { MemoryCategoryType, MemoryType } from '@companion/types';

// 표시 순서 + 한글 라벨 (백엔드 MemoryCategory enum 미러)
const CATEGORY_ORDER: MemoryCategoryType[] = [
  'INTEREST',
  'WORK',
  'GOAL',
  'LIFESTYLE',
  'RELATIONSHIP',
  'TRAIT',
  'ETC',
];
const CATEGORY_LABELS: Record<MemoryCategoryType, string> = {
  INTEREST: '관심사·취향',
  WORK: '학습·업무',
  GOAL: '목표·계획',
  LIFESTYLE: '생활·건강',
  RELATIONSHIP: '인간관계',
  TRAIT: '개인 특성',
  ETC: '기타',
};

export default function MemoryScreen() {
  const [memories, setMemories] = useState<MemoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMemories()
      .then(setMemories)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '오류'))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmDelete(m: MemoryType) {
    Alert.alert('기억 삭제', `"${m.content}"\n\n이 기억을 지울까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void deleteMemory(m.id).then(load);
        },
      },
    ]);
  }

  // 카테고리별로 묶되, 비어있는 카테고리는 건너뛴다
  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: memories.filter((m) => m.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <Screen scroll edges={['bottom']} contentClassName="gap-6 px-6 py-6">
      <Text className="text-sm text-ink-soft">
        대화에서 AI가 당신에 대해 기억한 것들이에요. 틀린 건 ✕ 로 지울 수 있어요.
      </Text>

      {loading ? (
        <ActivityIndicator color="#A78BFA" />
      ) : memories.length === 0 ? (
        <Text className="mt-8 text-center text-ink-faint">
          아직 기억하는 게 없어요.{'\n'}대화를 나누면 조금씩 알아가요.
        </Text>
      ) : (
        groups.map((g) => (
          <View key={g.cat} className="gap-2.5">
            <Text className="text-sm font-medium text-ink-soft">{CATEGORY_LABELS[g.cat]}</Text>
            <View className="gap-2">
              {g.items.map((m) => (
                <Card
                  key={m.id}
                  radius="2xl"
                  className="flex-row items-center justify-between px-5 py-3.5"
                >
                  <Text className="flex-1 pr-3 text-base text-ink">{m.content}</Text>
                  <Pressable onPress={() => confirmDelete(m)} hitSlop={8}>
                    <Text className="text-lg text-ink-faint">✕</Text>
                  </Pressable>
                </Card>
              ))}
            </View>
          </View>
        ))
      )}

      {error && <Text className="text-sm text-red-500">{error}</Text>}
    </Screen>
  );
}

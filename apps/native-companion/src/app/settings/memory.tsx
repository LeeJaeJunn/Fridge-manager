import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { deleteMemory, fetchMemories } from '@/api/memory';
import { Card, Screen } from '@/components';
import type { MemoryCategoryType, MemoryType } from '@companion/types';

/**
 * 카테고리 메타 — 표시 순서 + 라벨(칩·카드 공용) + 이모지 글리프 + 파스텔 틴트.
 * 백엔드 MemoryCategory enum 미러(소수·정적). 틴트는 tailwind 토큰(하드코딩 금지)이라
 * NativeWind content 스캔에 걸리도록 전체 클래스 문자열로 둔다.
 */
const CATEGORY_META: Record<
  MemoryCategoryType,
  { label: string; emoji: string; iconBg: string; iconText: string }
> = {
  // 안전 정보라 맨 앞에 둔다 (CATEGORY_ORDER 가 이 선언 순서를 그대로 쓴다)
  ALLERGY: {
    label: '먹으면 안 되는 것',
    emoji: '⚠️',
    iconBg: 'bg-peach-soft',
    iconText: 'text-peach',
  },
  PREFERENCE: { label: '식성', emoji: '🍽️', iconBg: 'bg-blush-soft', iconText: 'text-blush' },
  PROFILE: { label: '체질·성향', emoji: '🧩', iconBg: 'bg-sky-soft', iconText: 'text-sky-deep' },
  OWNERSHIP: {
    label: '조리도구',
    emoji: '🍳',
    iconBg: 'bg-mint-soft',
    iconText: 'text-mint-deep',
  },
  ETC: { label: '기타', emoji: '📎', iconBg: 'bg-sand', iconText: 'text-ink-soft' },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_META) as MemoryCategoryType[];

/** createdAt → "N일 전"(append-only라 생성 = 기억한 시점) */
function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `${days}일 전`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours}시간 전`;
  const mins = Math.floor(diff / 60_000);
  if (mins >= 1) return `${mins}분 전`;
  return '방금';
}

/** 필터 칩 — 전체 + 데이터에 존재하는 카테고리만 (빈 필터 방지) */
type Filter = 'ALL' | MemoryCategoryType;

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${active ? 'bg-lavender' : 'border border-line bg-white'}`}
    >
      <Text className={`text-sm ${active ? 'font-semibold text-white' : 'text-ink-soft'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

function MemoryCard({ memory, onDelete }: { memory: MemoryType; onDelete: () => void }) {
  const meta = CATEGORY_META[memory.category];
  return (
    <Card radius="3xl" className="flex-row gap-3 px-5 py-4">
      <View className={`h-10 w-10 items-center justify-center rounded-xl ${meta.iconBg}`}>
        <Text className="text-lg">{meta.emoji}</Text>
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-start justify-between">
          <Text className="text-base font-semibold text-ink">{meta.label}</Text>
          <Pressable onPress={onDelete} hitSlop={8}>
            <Text className="text-base text-ink-faint">✕</Text>
          </Pressable>
        </View>
        <Text className="text-[15px] leading-5 text-ink-soft">{memory.content}</Text>
        <Text className="mt-1 text-xs text-ink-faint">{timeAgo(memory.createdAt)}</Text>
      </View>
    </Card>
  );
}

export default function MemoryScreen() {
  const [memories, setMemories] = useState<MemoryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

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
    // void deleteMemory(m.id).then(load);
  }

  // 존재하는 카테고리만 칩으로 (표시 순서 유지)
  const presentCategories = CATEGORY_ORDER.filter((c) => memories.some((m) => m.category === c));
  const visible = (filter === 'ALL' ? memories : memories.filter((m) => m.category === filter))
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Screen scroll edges={['bottom']} contentClassName="gap-5 px-6 py-6">
      <Text className="text-sm text-ink-soft">
        대화에서 AI가 당신에 대해 기억한 것들이에요. 틀린 건 ✕ 로 지울 수 있어요.
      </Text>

      {presentCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-6"
        >
          <Chip label="전체" active={filter === 'ALL'} onPress={() => setFilter('ALL')} />
          {presentCategories.map((c) => (
            <Chip
              key={c}
              label={CATEGORY_META[c].label}
              active={filter === c}
              onPress={() => setFilter(c)}
            />
          ))}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator color="#8B5CF6" />
      ) : memories.length === 0 ? (
        <Text className="mt-8 text-center text-ink-faint">
          아직 기억하는 게 없어요.{'\n'}대화를 나누면 조금씩 알아가요.
        </Text>
      ) : (
        <View className="gap-3">
          {visible.map((m) => (
            <MemoryCard key={m.id} memory={m} onDelete={() => confirmDelete(m)} />
          ))}
        </View>
      )}

      {error && <Text className="text-sm text-red-500">{error}</Text>}
    </Screen>
  );
}

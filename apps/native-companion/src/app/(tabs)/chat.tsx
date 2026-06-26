import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deleteConversation, fetchConversations } from '@/api/conversation';
import type { ConversationSummaryType } from '@companion/types';

export default function ConversationListScreen() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationSummaryType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchConversations()
      .then(setConversations)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '오류'))
      .finally(() => setLoading(false));
  }, []);

  // 화면에 들어올 때마다 목록 새로고침 (새 대화 생성·삭제 반영)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmDelete(id: string) {
    Alert.alert('대화 삭제', '이 대화를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void deleteConversation(id).then(load);
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-row items-center justify-between px-6 py-4">
        <Text className="text-xl font-bold text-neutral-900">대화</Text>
        <Pressable
          onPress={() => router.push('/conversation/new')}
          className="rounded-full bg-indigo-500 px-4 py-2"
        >
          <Text className="font-semibold text-white">새 채팅</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#6366f1" />
        </View>
      ) : conversations.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-4 px-6">
          <Text className="text-neutral-400">아직 대화가 없어요.</Text>
          <Pressable
            onPress={() => router.push('/conversation/new')}
            className="rounded-full bg-indigo-500 px-6 py-3"
          >
            <Text className="font-semibold text-white">새 채팅 시작</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-2 px-4 pb-6">
          {conversations.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => router.push(`/conversation/${c.id}`)}
              onLongPress={() => confirmDelete(c.id)}
              className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3"
            >
              <Text numberOfLines={1} className="text-neutral-900">
                {c.preview ?? '새 대화'}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {error && <Text className="px-6 pb-2 text-sm text-red-500">{error}</Text>}
    </SafeAreaView>
  );
}

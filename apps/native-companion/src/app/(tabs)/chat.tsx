import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';

import { deleteConversation, fetchConversations } from '@/api/conversation';
import { Button, Card, Screen } from '@/components';
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
    <Screen>
      <View className="flex-row items-center justify-between px-6 py-4">
        <Text className="text-xl font-bold text-ink">대화</Text>
        <Button label="새 채팅" size="sm" onPress={() => router.push('/conversation/new')} />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#C94B55" />
        </View>
      ) : conversations.length === 0 ? (
        <ScrollView
          overScrollMode="always"
          contentContainerClassName="grow items-center justify-center gap-4 px-6"
        >
          <Text className="text-ink-faint">아직 대화가 없어요.</Text>
          <Button label="새 채팅 시작" onPress={() => router.push('/conversation/new')} />
        </ScrollView>
      ) : (
        <ScrollView overScrollMode="always" contentContainerClassName="gap-2 px-4 pb-6">
          {conversations.map((c) => (
            <Card
              key={c.id}
              radius="2xl"
              onPress={() => router.push(`/conversation/${c.id}`)}
              onLongPress={() => confirmDelete(c.id)}
              className="px-4 py-3.5"
            >
              <Text numberOfLines={1} className="text-ink">
                {c.preview ?? '새 대화'}
              </Text>
            </Card>
          ))}
        </ScrollView>
      )}

      {error && <Text className="px-6 pb-2 text-sm text-red-500">{error}</Text>}
    </Screen>
  );
}

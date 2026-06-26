import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchConversation,
  sendMessage,
  startConversation,
} from '@/api/conversation';
import type { MessageType } from '@companion/types';

export default function ConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [conversationId, setConversationId] = useState<string | null>(
    isNew ? null : id,
  );
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // 기존 대화면 메시지 로드 (새 대화는 빈 화면)
  useEffect(() => {
    if (!conversationId) return;
    fetchConversation(conversationId)
      .then((c) => setMessages(c.messages))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '오류'))
      .finally(() => setLoading(false));
    // 마운트 시 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    setError(null);
    setSending(true);

    // 낙관적: 유저 메시지를 즉시 표시
    const optimistic: MessageType = {
      id: `tmp-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      if (!conversationId) {
        // 새 대화: 첫 메시지로 생성 → 서버가 준 전체 메시지로 교체
        const convo = await startConversation({ content });
        setConversationId(convo.id);
        setMessages(convo.messages);
      } else {
        const assistant = await sendMessage(conversationId, { content });
        setMessages((prev) => [...prev, assistant]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '전송에 실패했습니다');
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 헤더 (전역 headerShown:false 라 직접 둠) */}
        <View className="flex-row items-center gap-3 border-b border-neutral-200 px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-2xl leading-6 text-neutral-700">‹</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-neutral-900">대화</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#6366f1" />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1 px-4"
            contentContainerClassName="gap-3 py-4"
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: true })
            }
          >
            {messages.length === 0 && (
              <Text className="mt-8 text-center text-neutral-400">
                메시지를 보내 대화를 시작하세요
              </Text>
            )}
            {messages.map((m) => (
              <View
                key={m.id}
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  m.role === 'user'
                    ? 'self-end bg-indigo-500'
                    : 'self-start bg-neutral-100'
                }`}
              >
                <Text
                  className={`text-base ${m.role === 'user' ? 'text-white' : 'text-neutral-900'}`}
                >
                  {m.content}
                </Text>
              </View>
            ))}
            {sending && (
              <View className="self-start rounded-2xl bg-neutral-100 px-4 py-3">
                <ActivityIndicator color="#6366f1" />
              </View>
            )}
          </ScrollView>
        )}

        {error && <Text className="px-4 pb-1 text-sm text-red-500">{error}</Text>}

        <View className="flex-row items-center gap-2 border-t border-neutral-200 px-4 py-3">
          <TextInput
            className="flex-1 rounded-full bg-neutral-100 px-4 py-2 text-neutral-900"
            placeholder="메시지를 입력하세요"
            placeholderTextColor="#9ca3af"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            editable={!sending}
            returnKeyType="send"
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !input.trim()}
            className={`rounded-full px-5 py-2 ${
              sending || !input.trim() ? 'bg-indigo-300' : 'bg-indigo-500'
            }`}
          >
            <Text className="font-semibold text-white">전송</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

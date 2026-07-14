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

import { fetchConversation, sendMessage, startConversation } from '@/api/conversation';
import { Bubble, Button, ProductCard, Screen } from '@/components';
import type { MessageType } from '@companion/types';

export default function ConversationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const [conversationId, setConversationId] = useState<string | null>(isNew ? null : id);
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

  // 임의 텍스트를 전송하는 코어 (입력창 전송 + "다른 상품 보여줘" 버튼이 공유)
  async function send(content: string) {
    if (!content || sending) return;
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

  function handleSend() {
    const content = input.trim();
    if (!content || sending) return;
    setInput('');
    void send(content);
  }

  // 마지막 답변이 상품 카드 + "더 있음"이면 이어보기 버튼을 노출 (소진되면 자동으로 사라짐)
  const last = messages[messages.length - 1];
  const canLoadMore =
    !sending &&
    last?.role === 'assistant' &&
    !!last.products?.length &&
    last.hasMoreProducts === true;

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 헤더 (전역 headerShown:false 라 직접 둠) */}
        <View className="flex-row items-center gap-3 border-b border-line px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-2xl leading-6 text-ink-soft">‹</Text>
          </Pressable>
          <Text className="text-lg font-semibold text-ink">대화</Text>
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#A78BFA" />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            className="flex-1 px-4"
            contentContainerClassName="gap-3 py-4"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 && (
              <Text className="mt-8 text-center text-ink-faint">
                메시지를 보내 대화를 시작하세요
              </Text>
            )}
            {messages.map((m) => (
              <View key={m.id} className="gap-2">
                <Bubble role={m.role} content={m.content} />
                {m.products && m.products.length > 0 && (
                  <View className="gap-2">
                    {m.products.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </View>
                )}
              </View>
            ))}
            {canLoadMore && (
              <View className="items-start">
                <Button
                  label="다른 상품 보여줘"
                  variant="secondary"
                  size="sm"
                  onPress={() => void send('다른 상품도 보여줘')}
                />
              </View>
            )}
            {sending && <Bubble role="assistant" pending />}
          </ScrollView>
        )}

        {error && <Text className="px-4 pb-1 text-sm text-red-500">{error}</Text>}

        <View className="flex-row items-center gap-2 border-t border-line px-4 py-3">
          <TextInput
            className="flex-1 rounded-full bg-sand px-4 py-2 text-ink"
            placeholder="메시지를 입력하세요"
            placeholderTextColor="#A1A1AA"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            editable={!sending}
            returnKeyType="send"
          />
          <Button
            label="전송"
            size="sm"
            className="px-5"
            onPress={handleSend}
            disabled={sending || !input.trim()}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

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

import { fetchCharacters, sendChat } from '@/api/chat';
import type { CharacterSummaryType, ChatMessageType } from '@/types/chat';

export default function ChatScreen() {
  const [characters, setCharacters] = useState<CharacterSummaryType[]>([]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // 진입 시 캐릭터 목록을 불러와 첫 캐릭터를 선택
  useEffect(() => {
    fetchCharacters()
      .then((list) => {
        setCharacters(list);
        if (list.length > 0) setCharacterId(list[0].id);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '오류'));
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || !characterId || loading) return;

    const next: ChatMessageType[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setError(null);
    setLoading(true);
    try {
      const result = await sendChat(characterId, next);
      setMessages((prev) => [...prev, { role: 'assistant', content: result.text }]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  // 캐릭터를 바꾸면 대화 초기화 (stateless 단계)
  function selectCharacter(id: string) {
    setCharacterId(id);
    setMessages([]);
    setError(null);
  }

  return (
    <SafeAreaView className="flex-1 bg-neutral-950" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 캐릭터 선택 */}
        <View className="flex-row gap-2 border-b border-neutral-800 px-4 py-3">
          {characters.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => selectCharacter(c.id)}
              className={`rounded-full px-4 py-2 ${
                characterId === c.id ? 'bg-indigo-500' : 'bg-neutral-800'
              }`}
            >
              <Text className="text-white">{c.name}</Text>
            </Pressable>
          ))}
        </View>

        {/* 메시지 목록 */}
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-4"
          contentContainerClassName="gap-3 py-4"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && (
            <Text className="mt-8 text-center text-neutral-500">메시지를 보내 대화를 시작하세요</Text>
          )}
          {messages.map((m, i) => (
            <View
              key={i}
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                m.role === 'user' ? 'self-end bg-indigo-500' : 'self-start bg-neutral-800'
              }`}
            >
              <Text className="text-base text-white">{m.content}</Text>
            </View>
          ))}
          {loading && (
            <View className="self-start rounded-2xl bg-neutral-800 px-4 py-3">
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </ScrollView>

        {error && <Text className="px-4 pb-1 text-sm text-red-400">{error}</Text>}

        {/* 입력 */}
        <View className="flex-row items-center gap-2 border-t border-neutral-800 px-4 py-3">
          <TextInput
            className="flex-1 rounded-full bg-neutral-800 px-4 py-2 text-white"
            placeholder="메시지를 입력하세요"
            placeholderTextColor="#888"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSend}
            editable={!loading}
            returnKeyType="send"
          />
          <Pressable
            onPress={handleSend}
            disabled={loading || !input.trim()}
            className={`rounded-full px-5 py-2 ${
              loading || !input.trim() ? 'bg-neutral-700' : 'bg-indigo-500'
            }`}
          >
            <Text className="font-semibold text-white">전송</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

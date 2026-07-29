import { ActivityIndicator, Text, View } from 'react-native';

type Props = {
  role: 'user' | 'assistant';
  content?: string;
  /** 응답 대기 중이면 점 대신 스피너 (assistant 전용) */
  pending?: boolean;
};

/** 채팅 말풍선 — 유저는 라벤더(오른쪽), 컴패니언은 회색(왼쪽). */
export function Bubble({ role, content, pending = false }: Props) {
  const isUser = role === 'user';
  return (
    <View
      className={`max-w-[80%] rounded-3xl px-4 py-2.5 ${
        isUser ? 'self-end bg-lavender' : 'self-start bg-sand'
      }`}
    >
      {pending ? (
        <ActivityIndicator color="#8B5CF6" />
      ) : (
        <Text className={`text-base ${isUser ? 'text-white' : 'text-ink'}`}>{content}</Text>
      )}
    </View>
  );
}

import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCharacter } from '@/context/character';

export default function HomeScreen() {
  const { character } = useCharacter();

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-1 items-center justify-center gap-6 px-6">
        <Text className="text-2xl font-bold text-neutral-900">
          {character?.name ?? '컴패니언'}와 함께해요
        </Text>
        <Text className="text-center text-neutral-500">
          오늘 하루는 어땠어요? 이야기를 들려주세요.
        </Text>
        <Link href="/chat" asChild>
          <Pressable className="rounded-full bg-indigo-500 px-6 py-3">
            <Text className="font-semibold text-white">대화하기</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

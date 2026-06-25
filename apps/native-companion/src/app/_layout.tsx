import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CharacterProvider, useCharacter } from '@/context/character';

// 캐릭터 로딩이 끝날 때까지 스플래시 유지 → 온보딩/홈 깜빡임 방지
void SplashScreen.preventAutoHideAsync();

function SplashScreenController() {
  const { isLoading } = useCharacter();
  if (!isLoading) void SplashScreen.hideAsync();
  return null;
}

/** 캐릭터 유무로 보여줄 화면 그룹을 가드 (expo-router 권장 패턴) */
function RootNavigator() {
  const { character } = useCharacter();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!character}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!character}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* 라이트 배경이라 상태바 아이콘은 어둡게 */}
      <StatusBar style="dark" />
      <CharacterProvider>
        <SplashScreenController />
        <RootNavigator />
      </CharacterProvider>
    </SafeAreaProvider>
  );
}

import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/context/auth';
import { CharacterProvider, useCharacter } from '@/context/character';

// auth/캐릭터 로딩이 끝날 때까지 스플래시 유지 → 온보딩/홈 깜빡임 방지
void SplashScreen.preventAutoHideAsync();

// 프로필 하위 페이지용 파스텔 테마 헤더 (뒤로가기 버튼은 자동 제공)
const THEMED_HEADER = {
  headerShown: true,
  headerStyle: { backgroundColor: '#FBF8F4' },
  headerShadowVisible: false,
  headerTintColor: '#3D3A4E',
  headerTitleStyle: { color: '#3D3A4E' },
} as const;

function SplashScreenController() {
  const { isLoading: isAuthLoading } = useAuth();
  const { isLoading: isCharacterLoading } = useCharacter();
  if (!isAuthLoading && !isCharacterLoading) void SplashScreen.hideAsync();
  return null;
}

/** auth → 캐릭터 순서로 보여줄 화면 그룹을 가드 (expo-router 권장 패턴) */
function RootNavigator() {
  const { status } = useAuth();
  const { character } = useCharacter();
  const isAuthed = status === 'authenticated';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'unauthenticated'}>
        <Stack.Screen name="login" />
      </Stack.Protected>

      <Stack.Protected guard={isAuthed && !!character}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen
          name="settings/character"
          options={{ ...THEMED_HEADER, title: '캐릭터 설정' }}
        />
        <Stack.Screen
          name="settings/memory"
          options={{ ...THEMED_HEADER, title: 'AI가 기억하는 나' }}
        />
      </Stack.Protected>

      <Stack.Protected guard={isAuthed && !character}>
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
      <AuthProvider>
        <CharacterProvider>
          <SplashScreenController />
          <RootNavigator />
        </CharacterProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCallback, useState } from 'react';
import { View, type ColorValue } from 'react-native';

import { CenterFabMenu } from '@/components/CenterFabMenu';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * 탭 아이콘 — **선택하면 채운 모양, 아니면 외곽선.** 색은 `Tabs` 의 tint 가 넘겨주므로
 * 여기서 하드코딩하지 않는다(활성/비활성 색이 한 곳에만 있게).
 *
 * 컴포넌트가 아니라 **렌더 콜백**이다(react-navigation 이 함수로 부른다). 그래서 매 렌더마다
 * 새 함수가 만들어져도 리마운트가 일어나지 않는다.
 */
const tabIcon =
  (on: IconName, off: IconName) =>
  // JSX 를 돌려주니 lint 가 컴포넌트로 보지만, react-navigation 은 이걸 **함수로 호출**한다
  // (`<Icon/>` 로 마운트하지 않는다). 그래서 displayName 이 붙을 자리가 없다.
  // eslint-disable-next-line react/display-name
  ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Ionicons name={focused ? on : off} size={size} color={color} />
  );

export default function TabsLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const toggle = useCallback(() => setMenuOpen((v) => !v), []);
  const close = useCallback(() => setMenuOpen(false), []);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#8B5CF6',
          tabBarInactiveTintColor: '#A1A1AA',
          tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#E9E9EC' },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: '홈', tabBarIcon: tabIcon('home', 'home-outline') }}
        />
        <Tabs.Screen
          name="fridge"
          options={{
            title: '냉장고',
            // Ionicons 에 냉장고 아이콘이 없다. 이 탭의 내용이 "가진 재료"라 음식 아이콘으로 대신한다
            // (`basket` 은 장보기로 읽혀서 뺐다 — 여긴 사는 곳이 아니라 갖고 있는 곳이다).
            tabBarIcon: tabIcon('nutrition', 'nutrition-outline'),
          }}
        />
        {/* 가운데 FAB 자리만 비워둔다 — 실제 FAB 는 아래 CenterFabMenu 오버레이가 그린다(위치 일치) */}
        <Tabs.Screen
          name="quickadd"
          options={{ title: '', tabBarButton: () => <View className="flex-1" /> }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: '채팅',
            tabBarIcon: tabIcon('chatbubble-ellipses', 'chatbubble-ellipses-outline'),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: '프로필', tabBarIcon: tabIcon('person', 'person-outline') }}
        />
      </Tabs>

      <CenterFabMenu open={menuOpen} onToggle={toggle} onClose={close} />
    </>
  );
}

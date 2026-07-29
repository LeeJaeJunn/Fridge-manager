import { Tabs } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';

import { CenterFabMenu } from '@/components/CenterFabMenu';

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
        <Tabs.Screen name="index" options={{ title: '홈' }} />
        <Tabs.Screen name="fridge" options={{ title: '냉장고' }} />
        {/* 가운데 FAB 자리만 비워둔다 — 실제 FAB 는 아래 CenterFabMenu 오버레이가 그린다(위치 일치) */}
        <Tabs.Screen
          name="quickadd"
          options={{ title: '', tabBarButton: () => <View className="flex-1" /> }}
        />
        <Tabs.Screen name="chat" options={{ title: '채팅' }} />
        <Tabs.Screen name="profile" options={{ title: '프로필' }} />
      </Tabs>

      <CenterFabMenu open={menuOpen} onToggle={toggle} onClose={close} />
    </>
  );
}

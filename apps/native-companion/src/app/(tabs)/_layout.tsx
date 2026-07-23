import { Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#8B6FE8',
        tabBarInactiveTintColor: '#A1A1AA',
        tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#E9E9EC' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="fridge" options={{ title: '냉장고' }} />
      <Tabs.Screen name="chat" options={{ title: '채팅' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
}

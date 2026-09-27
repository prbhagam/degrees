// Owner: shared mobile scaffold (Charles) — the persistent bottom nav from the validated design
// (Home / Chats / Circle / Profile). Added Sep 26 — previously these screens had no real navigation
// between them at all, only the __DEV__ links list in HomeScreen stood in for it.
// CHANGED Sep 26 (wave 5, Sahith): a Chats tab (every open group chat in one place), and the bar's items are
// centred — they used to hug the top edge with the whole home-indicator inset left blank underneath.
import { Tabs } from 'expo-router';
import { House, MessageCircle, Network, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#20201C',
        tabBarInactiveTintColor: '#8A8378',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E4DDD0',
          height: 58 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarLabelStyle: { fontFamily: 'PublicSans_600SemiBold', fontSize: 11, marginTop: 2 },
        headerStyle: { backgroundColor: '#F7F3EC' },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: 'Fraunces_700Bold', color: '#20201C', fontSize: 20 },
        headerTintColor: '#20201C',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Degrees',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarLabel: 'Chats',
          tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="circle"
        options={{
          title: 'Your circle',
          tabBarLabel: 'Circle',
          tabBarIcon: ({ color, size }) => <Network color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Degree 0 (You)',
          tabBarLabel: 'You',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

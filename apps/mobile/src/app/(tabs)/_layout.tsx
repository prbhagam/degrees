// Owner: shared mobile scaffold (Charles) — the persistent bottom nav from the validated design
// (Home / Circle / Profile). Added Sep 26 — previously these 3 screens had no real navigation
// between them at all, only the __DEV__ links list in HomeScreen stood in for it.
import { Tabs } from 'expo-router';
import { House, Network, User } from 'lucide-react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#20201C',
        tabBarInactiveTintColor: '#8A8378',
        tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#E4DDD0' },
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
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

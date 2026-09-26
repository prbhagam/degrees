// Owner: shared mobile scaffold (Charles) — the persistent bottom nav from the validated design
// (Home / Circle / Profile). Added Sep 26 — previously these 3 screens had no real navigation
// between them at all, only the __DEV__ links list in HomeScreen stood in for it.
import { Tabs } from 'expo-router';
import { House, Network, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#20201C',
        tabBarInactiveTintColor: '#8A8378',
        // CHANGED Sep 26: with no explicit height, the bar's total height includes the bottom safe
        // area (home indicator), but the icon+label render pinned near the top of that whole
        // height — looks like they're jammed against the top edge with a dead zone below. Giving
        // the icon/label a fixed content height and pushing the safe-area inset into paddingBottom
        // instead centers them in the bar's actual visible (non-safe-area) portion.
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E4DDD0',
          height: 56 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom,
        },
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

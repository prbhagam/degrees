// Owner: Pranav (Groups, Activities & Chat) — runs matching and hands off to the group view.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session';
import { queryKeys } from './queries';
import { Body, Button, ErrorState, Muted, Screen } from '@/components/ui';

// Concentric rings for 1st/2nd/3rd degree, pulsing outward while the server searches.
function DegreeRings({ searching }: { searching: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (searching) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0);
    }
  }, [pulse, searching]);

  const wave = useAnimatedStyle(() => ({
    transform: [{ scale: 0.4 + pulse.value * 0.8 }],
    opacity: 1 - pulse.value,
  }));

  return (
    <View className="h-64 items-center justify-center">
      {[240, 176, 112].map((size, index) => (
        <View
          key={size}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          className={`absolute border ${['border-line', 'border-line', 'border-sage'][index]}`}
        />
      ))}
      <Animated.View
        style={[{ width: 240, height: 240, borderRadius: 120 }, wave]}
        className="absolute bg-ember/20"
      />
      <View className="h-14 w-14 items-center justify-center rounded-full bg-ink">
        <Users size={26} color="#F7F3EC" />
      </View>
    </View>
  );
}

export function MatchScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveGroupId = useSessionStore((state) => state.setActiveGroupId);

  const match = useMutation({
    mutationFn: api.runMatch,
    onSuccess: (result) => {
      setActiveGroupId(result.groupId);
      void queryClient.invalidateQueries({ queryKey: queryKeys.myGroups });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.group(result.groupId),
      });
      router.replace(`/groups/${result.groupId}`);
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Find your group' }} />
      <DegreeRings searching={match.isPending} />
      <View className="gap-2">
        <Text className="text-center font-display text-2xl text-ink">
          {match.isPending
            ? 'Looking through your network…'
            : 'Meet your next group'}
        </Text>
        <Body className="text-center">
          Degrees looks at the people you’ve met, and the people they’ve met,
          then picks a small group that should get along in person.
        </Body>
        <Muted className="text-center">
          How far it reaches is up to your degrees setting.
        </Muted>
      </View>
      {match.isError ? <ErrorState message={match.error.message} /> : null}
      <Button
        label={match.isPending ? 'Matching…' : 'Find my group'}
        loading={match.isPending}
        onPress={() => match.mutate()}
      />
    </Screen>
  );
}

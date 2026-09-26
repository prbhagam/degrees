// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import type { Activity } from '@degrees/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  CalendarClock,
  DollarSign,
  ExternalLink,
  Navigation,
  RefreshCw,
  Sparkles,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { queryKeys, useGroup } from '@/features/groups/queries';
import {
  Body,
  Button,
  Card,
  ErrorState,
  Heading,
  LoadingState,
  Muted,
  Screen,
} from '@/features/groups/ui';
import { api } from '@/lib/api';
import { formatPrice, formatStartsAt } from './format';

function directionsUrl(activity: Activity): string {
  const query = new URLSearchParams({
    daddr: `${activity.lat},${activity.lng}`,
    q: activity.venue,
  });
  return `https://maps.apple.com/?${query}`;
}

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2">
      {icon}
      <Text className="text-base text-neutral-800 dark:text-neutral-200">
        {children}
      </Text>
    </View>
  );
}

// Google requires grounded Maps sources to be shown right after the generated content, linked, and unmodified.
function SourceAttribution({ activity }: { activity: Activity }) {
  const label = activity.source === 'maps' ? 'Google Maps' : 'Ticketmaster';
  const prefix = activity.source === 'maps' ? 'Source:' : 'Tickets via';
  if (!activity.sourceUrl) {
    return <Muted>{`${prefix} ${label}`}</Muted>;
  }
  const url = activity.sourceUrl;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void Linking.openURL(url)}
      className="flex-row items-center gap-1"
    >
      <Muted>{prefix}</Muted>
      <Text className="text-sm font-semibold text-violet-600 underline dark:text-violet-400">
        {label}
      </Text>
      <ExternalLink size={12} color="#7c3aed" />
    </Pressable>
  );
}

function ActivityDetails({ activity }: { activity: Activity }) {
  const iconColor = '#737373';
  return (
    <>
      <View className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <MapView
          style={{ height: 220 }}
          initialRegion={{
            latitude: activity.lat,
            longitude: activity.lng,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          onPress={() => void Linking.openURL(directionsUrl(activity))}
        >
          <Marker
            coordinate={{ latitude: activity.lat, longitude: activity.lng }}
            title={activity.venue}
          />
        </MapView>
      </View>

      <View className="gap-1">
        <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
          {activity.title}
        </Text>
        <Text className="text-base font-medium text-neutral-700 dark:text-neutral-300">
          {activity.venue}
        </Text>
        <Muted>{activity.address}</Muted>
      </View>

      <Card>
        <Fact icon={<DollarSign size={18} color={iconColor} />}>
          {formatPrice(activity.priceCents)}
        </Fact>
        <Fact icon={<CalendarClock size={18} color={iconColor} />}>
          {formatStartsAt(activity.startsAt)}
        </Fact>
      </Card>

      <Card className="border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40">
        <View className="flex-row items-center gap-2">
          <Sparkles size={16} color="#7c3aed" />
          <Heading>Why this plan</Heading>
        </View>
        <Body>{activity.reasoning}</Body>
        <SourceAttribution activity={activity} />
      </Card>

      <Button
        label="Directions"
        icon={<Navigation size={18} color="white" />}
        onPress={() => void Linking.openURL(directionsUrl(activity))}
      />
      {activity.source === 'ticketmaster' && activity.sourceUrl ? (
        <Button
          label="Get tickets"
          variant="secondary"
          icon={<ExternalLink size={18} color={iconColor} />}
          onPress={() => void Linking.openURL(activity.sourceUrl!)}
        />
      ) : null}
    </>
  );
}

export function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const group = useGroup(id);

  const generate = useMutation({
    mutationFn: () => api.generateActivity(id),
    onSuccess: (activity) => {
      // The response is the saved plan, so the group view can show it without a refetch.
      queryClient.setQueryData(
        queryKeys.group(id),
        (previous: typeof group.data) =>
          previous ? { ...previous, activity } : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.group(id) });
    },
  });

  const activity = group.data?.activity ?? null;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'The plan' }} />
      {group.isPending ? <LoadingState label="Loading the plan…" /> : null}
      {group.isError ? (
        <ErrorState
          message={group.error.message}
          onRetry={() => void group.refetch()}
        />
      ) : null}

      {generate.isPending ? (
        <LoadingState label="Finding a real place that fits everyone…" />
      ) : null}
      {generate.isError ? (
        <ErrorState message={generate.error.message} />
      ) : null}

      {group.data && !activity && !generate.isPending ? (
        <Card className="items-center py-8">
          <Sparkles size={28} color="#7c3aed" />
          <Body className="text-center">
            No plan yet. Degrees will pick one real place near everyone that
            fits the group’s budget.
          </Body>
          <Button label="Plan something" onPress={() => generate.mutate()} />
        </Card>
      ) : null}

      {activity && !generate.isPending ? (
        <>
          <ActivityDetails activity={activity} />
          <Button
            label="Suggest something else"
            variant="ghost"
            icon={<RefreshCw size={16} color="#7c3aed" />}
            onPress={() => generate.mutate()}
          />
        </>
      ) : null}
    </Screen>
  );
}

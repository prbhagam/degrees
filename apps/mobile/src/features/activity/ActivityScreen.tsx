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
} from '@/components/ui';
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
      <Text className="font-body text-base text-ink">{children}</Text>
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
      <Text className="font-body-semibold text-sm text-ember-ink underline">{label}</Text>
      <ExternalLink size={12} color="#B8501F" />
    </Pressable>
  );
}

function ActivityDetails({ activity }: { activity: Activity }) {
  const iconColor = '#8A8378';
  return (
    <>
      <View className="overflow-hidden rounded-l border border-line">
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
        <Text className="font-display text-2xl text-ink">{activity.title}</Text>
        <Text className="font-body-medium text-base text-ink">{activity.venue}</Text>
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

      <Card className="border-line bg-paper-raised">
        <View className="flex-row items-center gap-2">
          <Sparkles size={16} color="#5B7A6B" />
          <Heading>Why this plan</Heading>
        </View>
        <Body>{activity.reasoning}</Body>
        <SourceAttribution activity={activity} />
      </Card>

      <Button
        label="Directions"
        icon={<Navigation size={18} color="#F7F3EC" />}
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
          previous
            ? {
                ...previous,
                activity,
                activityStatus: activity.status ?? 'generating',
              }
            : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.group(id) });
    },
  });

  const activity = group.data?.activity ?? null;
  const isGenerating =
    generate.isPending ||
    activity?.status === 'generating' ||
    group.data?.activityStatus === 'generating';

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

      {isGenerating ? (
        <Card className="items-center gap-3 border-sage/40 bg-paper-raised py-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-sage/20">
            <Sparkles size={28} color="#5B7A6B" />
          </View>
          <Heading>Finding the best spot…</Heading>
          <Body className="text-center">
            Degrees AI is curating a real hangout plan with Google Maps based on
            group interests, location, and budgets.
          </Body>
          <LoadingState label="Generating your plan…" />
        </Card>
      ) : null}

      {generate.isError ? (
        <ErrorState message={generate.error.message} />
      ) : null}

      {group.data && !activity && !isGenerating ? (
        <Card className="items-center py-8">
          <Sparkles size={28} color="#5B7A6B" />
          <Body className="text-center">
            No plan yet. Degrees will pick one real place near everyone that
            fits the group’s budget.
          </Body>
          <Button label="Plan something" onPress={() => generate.mutate()} />
        </Card>
      ) : null}

      {activity && !isGenerating ? (
        <>
          <ActivityDetails activity={activity} />
          <Button
            label="Suggest something else"
            variant="ghost"
            icon={<RefreshCw size={16} color="#20201C" />}
            onPress={() => generate.mutate()}
          />
        </>
      ) : null}
    </Screen>
  );
}

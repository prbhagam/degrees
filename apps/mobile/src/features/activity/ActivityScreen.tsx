// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
// CHANGED Sep 26 (wave 3): plans are kept. Earlier plans list under the current one (GroupResponse.activityHistory)
// with "Use this plan" to bring one back, and "Suggest something else" tells the planner which venues it already
// suggested, so it stops returning the same place.
// CHANGED Sep 26 (wave 5, Sahith): "When" lives here (TimesCard) — propose times, say you're free, lock one in.
// "Use this plan" no longer duplicates: the restored plan leaves Earlier plans (server moves the row; the cache
// mirrors that before the refetch).
import type { Activity, GroupResponse } from '@degrees/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import * as Linking from 'expo-linking';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  CalendarClock,
  DollarSign,
  ExternalLink,
  History,
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
import { TimesCard } from './TimesCard';
import { useActivityJob } from './useActivityJob';

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
        {activity.createdAt ? (
          <Muted>Suggested {format(parseISO(activity.createdAt), 'EEE, MMM d · h:mm a')}</Muted>
        ) : null}
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

function PreviousPlan({
  activity,
  onRestore,
  restoring,
}: {
  activity: Activity;
  onRestore: () => void;
  restoring: boolean;
}) {
  return (
    <Card>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <Text className="font-body-semibold text-base text-ink">{activity.title}</Text>
          <Muted>
            {activity.venue} · {formatPrice(activity.priceCents)}
          </Muted>
          {activity.createdAt ? (
            <Muted>{format(parseISO(activity.createdAt), 'EEE, MMM d · h:mm a')}</Muted>
          ) : null}
        </View>
        <Button label="Use this plan" variant="secondary" className="min-h-9 py-1.5" loading={restoring} onPress={onRestore} />
      </View>
      <Muted numberOfLines={2}>{activity.reasoning}</Muted>
    </Card>
  );
}

export function ActivityScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const group = useGroup(id);

  // The response is the saved plan, so the group view can show it without a refetch. `restoredId` (wave 5): the
  // plan being brought back leaves Earlier plans and the one it replaces joins them, mirroring the server.
  const applyPlan = (activity: Activity, restoredId?: string) => {
    queryClient.setQueryData<GroupResponse>(queryKeys.group(id), (previous) => {
      if (!previous) return previous;
      let activityHistory = previous.activityHistory;
      if (restoredId) {
        const outgoing = previous.activity;
        activityHistory = [
          ...(outgoing && outgoing.status !== 'generating' && outgoing.id !== restoredId ? [outgoing] : []),
          ...previous.activityHistory.filter((plan) => plan.id !== restoredId),
        ];
      }
      return { ...previous, activity, activityStatus: activity.status ?? 'ready', activityHistory };
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.group(id) });
  };

  const generate = useMutation({
    mutationFn: () => api.generateActivity(id),
    onSuccess: (activity) => applyPlan({ ...activity, status: activity.status ?? 'generating' }),
  });
  const restore = useMutation({
    mutationFn: (activityId: string) => api.restoreActivity(id, activityId),
    onSuccess: (activity, activityId) => applyPlan(activity, activityId),
  });

  const activity =
    group.data?.activity && group.data.activity.status !== 'generating' ? group.data.activity : null;
  const history = group.data?.activityHistory ?? [];
  const jobRunning =
    group.data?.activity?.status === 'generating' || group.data?.activityStatus === 'generating';
  const isGenerating = generate.isPending || jobRunning;
  const isFailed = group.data?.activityStatus === 'failed';
  // Wave 2: the server only starts the job; this hook advances it stage by stage (see useActivityJob).
  const job = useActivityJob(id, Boolean(jobRunning));

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
            group interests, location, budgets, and what everyone would rather skip.
          </Body>
          {job.stalled ? (
            <>
              <Muted>Lost the connection while planning.</Muted>
              <Button label="Keep going" variant="secondary" onPress={job.retry} />
            </>
          ) : (
            <LoadingState label="Generating your plan…" />
          )}
        </Card>
      ) : null}

      {generate.isError ? (
        <ErrorState message={generate.error.message} />
      ) : null}
      {restore.isError ? <ErrorState message={restore.error.message} /> : null}

      {isFailed && !isGenerating && !activity ? (
        <Card className="items-center gap-3 border-line bg-paper-raised py-8">
          <Heading>Couldn't finish the plan</Heading>
          <Body className="text-center">
            The AI service hit a rate limit or ran out of quota while finding a venue.
          </Body>
          <Button
            label="Try again"
            loading={generate.isPending}
            onPress={() => generate.mutate()}
          />
        </Card>
      ) : null}

      {group.data && !activity && !isGenerating && !isFailed ? (
        <Card className="items-center py-8">
          <Sparkles size={28} color="#5B7A6B" />
          <Body className="text-center">
            No plan yet. Degrees will pick one real place near everyone that
            fits the group's budget — and skips anything someone here opted out of.
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

      {group.data && !isGenerating ? <TimesCard groupId={id} group={group.data} /> : null}

      {history.length > 0 ? (
        <View className="gap-3 pt-2">
          <View className="flex-row items-center gap-2">
            <History size={16} color="#8A8378" />
            <Heading>Earlier plans</Heading>
          </View>
          <Muted>Everything suggested for this group so far. New suggestions won't repeat these venues.</Muted>
          {history.map((previous) => (
            <PreviousPlan
              key={previous.id ?? `${previous.venue}-${previous.createdAt}`}
              activity={previous}
              restoring={restore.isPending && restore.variables === previous.id}
              onRestore={() => previous.id && restore.mutate(previous.id)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

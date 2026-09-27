// Owner: Christian (Notifications) — Added Sep 26 (wave 5, Sahith). One switch per kind of notification the
// server writes (packages/shared NOTIFICATION_SETTING_FOR maps types to these four). Saved on the profile
// through PUT /api/notifications/settings; the toggle flips at once and rolls back if the save fails.
import type { MeResponse, NotificationSettings } from '@degrees/shared';
import { DEFAULT_NOTIFICATION_SETTINGS } from '@degrees/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { Switch, Text, View } from 'react-native';
import { Card, ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { queryKeys, useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';

const ROWS: { key: keyof NotificationSettings; title: string; description: string }[] = [
  { key: 'hangouts', title: 'New groups & hangouts', description: "You've been added to a group, or everyone said yes." },
  { key: 'exchange', title: 'Contact exchange', description: 'Someone wants to swap numbers, or agreed to.' },
  { key: 'met', title: 'Someone says you met', description: 'A "We met" tap, or a meetup that connected you.' },
  { key: 'changes', title: 'Changes to a meetup or plan', description: 'Renamed, a time locked in, a new plan, or it ended.' },
];

export function NotificationSettingsScreen() {
  const queryClient = useQueryClient();
  const me = useMe();
  const settings = me.data?.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS;

  const update = useMutation({
    mutationFn: (patch: Partial<NotificationSettings>) => api.updateNotificationSettings(patch),
    // Optimistic on purpose: a switch that lags feels broken. Rolled back below if the save fails.
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.me });
      const previous = queryClient.getQueryData<MeResponse>(queryKeys.me);
      queryClient.setQueryData<MeResponse>(queryKeys.me, (current) =>
        current ? { ...current, notificationSettings: { ...current.notificationSettings, ...patch } } : current,
      );
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.me, context.previous);
    },
    onSuccess: ({ settings: saved }) => {
      queryClient.setQueryData<MeResponse>(queryKeys.me, (current) =>
        current ? { ...current, notificationSettings: saved } : current,
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.me }),
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Notification settings' }} />
      {me.isPending ? <LoadingState label="Loading…" /> : null}
      {me.isError ? <ErrorState message={me.error.message} onRetry={() => void me.refetch()} /> : null}
      {me.data ? (
        <>
          <Card className="p-0">
            {ROWS.map((row, index) => (
              <View
                key={row.key}
                className={`flex-row items-center justify-between gap-3 px-4 py-3.5 ${index < ROWS.length - 1 ? 'border-b border-line' : ''}`}
              >
                <View className="flex-1">
                  <Text className="font-body-semibold text-[15px] text-ink">{row.title}</Text>
                  <Muted className="mt-0.5">{row.description}</Muted>
                </View>
                <Switch
                  accessibilityLabel={row.title}
                  value={settings[row.key]}
                  trackColor={{ true: '#5B7A6B', false: '#E4DDD0' }}
                  onValueChange={(value) => update.mutate({ [row.key]: value })}
                />
              </View>
            ))}
          </Card>
          {update.isError ? <Muted>{update.error.message}</Muted> : null}
          <Muted>Messages don't notify yet — chat is live while the app is open.</Muted>
        </>
      ) : null}
    </Screen>
  );
}

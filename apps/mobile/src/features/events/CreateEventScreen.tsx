// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26.
// CHANGED Sep 26 (wave 2): "Host a meetup". Opens the meetup's group screen, which has the code + QR, the lobby,
// icebreakers, chat, plan, and photos. No separate lobby screen.
// CHANGED Sep 26 (wave 5, Sahith): no calendar here. You host a meetup when you're already with the people, so it
// starts now and the code works for 24 hours. Scheduling lives on the generated plan (TimesCard), where the group
// talks through when they're free.
// CHANGED Sep 27 (wave 6, Sahith): hosting asks for nothing. A meetup is an icebreaker for people already in the same
// room — get everyone onto Degrees, connected, and on record — so there's no name, description, or group size. It's
// titled by who joins (hangoutTitle) and can be renamed from the group screen.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { Play } from 'lucide-react-native';
import { View } from 'react-native';
import { queryKeys } from '@/features/groups/queries';
import { DegreesMark } from '@/components/DegreesMark';
import { Button, ErrorState, Muted, Screen, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session';

export function CreateEventScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveEvent = useSessionStore((state) => state.setActiveEvent);

  const create = useMutation({
    mutationFn: () => api.createEvent({}),
    onSuccess: async ({ roomCode }) => {
      // The host is already a member; joining their own code just resolves the backing group id.
      const joined = await api.joinEvent(roomCode);
      setActiveEvent({ id: joined.eventId, name: joined.name, groupId: joined.groupId });
      void queryClient.invalidateQueries({ queryKey: queryKeys.hangouts });
      router.replace(`/groups/${joined.groupId}`);
    },
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Host a meetup' }} />
      <View className="items-center gap-4 pt-6">
        <DegreesMark size={64} />
        <Title className="text-center">Start a meetup</Title>
        <Muted className="text-center">
          For when you're already together. Everyone scans your code or types it in, you get icebreakers, and when you
          end it, everyone who came becomes each other's 1st degree.
        </Muted>
        <Muted className="text-center">Nothing to fill in. The code works for 24 hours.</Muted>
      </View>

      {create.isError ? <ErrorState message={create.error.message} /> : null}
      <Button
        label="Start meetup"
        className="mt-4"
        icon={<Play size={18} color="#F7F3EC" />}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </Screen>
  );
}

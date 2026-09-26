// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { useGroup } from '@/features/groups/queries';

const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;
const TILE_COLORS = ['#E8703A', '#5B7A6B', '#E4DDD0', '#20201C'];

export function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const queryClient = useQueryClient();

  const photos = useQuery({
    queryKey: ['photos', id],
    queryFn: () => api.getPhotos(id!),
    enabled: Boolean(id),
  });

  const completedAt = group.data?.completedAt;
  const archived = Boolean(completedAt && Date.now() - new Date(completedAt).getTime() > ARCHIVE_GRACE_MS);
  const endedNotArchived = Boolean(completedAt) && !archived;

  const addPhoto = useMutation({
    // No real image picker wired up yet — this posts a placeholder path so the flow (and the
    // archive lock) can be exercised end to end. A real build swaps this for expo-image-picker +
    // a Supabase Storage upload, then posts the resulting storagePath.
    mutationFn: () => api.addPhoto(id!, `demo/${Date.now()}.jpg`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['photos', id] }),
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Photos' }} />
      {photos.isPending || group.isPending ? <LoadingState label="Loading photos…" /> : null}
      {photos.isError ? <ErrorState message={photos.error.message} onRetry={() => void photos.refetch()} /> : null}

      {endedNotArchived ? (
        <View className="rounded-m border border-line bg-[#F0EDE5] px-3.5 py-3">
          <Muted>Hangout's over — new uploads close in 24 hours.</Muted>
        </View>
      ) : null}
      {archived ? (
        <View className="rounded-m border border-line bg-[#F0EDE5] px-3.5 py-3">
          <Muted>Archived — you can still browse these, but new uploads are closed.</Muted>
        </View>
      ) : null}

      {photos.data ? (
        <View className="flex-row flex-wrap gap-2">
          {photos.data.photos.map((photo, index) => (
            <View key={photo.id} style={{ width: '31%' }}>
              <View
                style={{ backgroundColor: TILE_COLORS[index % TILE_COLORS.length], aspectRatio: 1, opacity: 0.85 }}
                className="rounded-s"
              />
              <Text className="mt-1 font-body text-[10px] text-muted">{photo.uploaderName}</Text>
            </View>
          ))}
          {photos.data.photos.length === 0 ? <Muted>No photos yet — be the first.</Muted> : null}
        </View>
      ) : null}

      {!archived ? (
        <Button label="+ Add a photo" variant="ghost" loading={addPhoto.isPending} onPress={() => addPhoto.mutate()} />
      ) : null}
    </Screen>
  );
}

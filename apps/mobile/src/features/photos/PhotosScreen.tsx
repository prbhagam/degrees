// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26.
// CHANGED Sep 26 (wave 2): real photos. expo-image-picker → Supabase Storage (event-photos/<groupId>/…, under
// the storage policies in migration 0007) → POST the path; the server answers with signed URLs to render.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ImagePlus } from 'lucide-react-native';
import { Image, RefreshControl, Text, View } from 'react-native';
import { Button, ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { queryKeys, useGroup } from '@/features/groups/queries';
import { LIVE_POLL_MS } from '@/lib/query';
import { pickImage, uploadGroupPhoto } from '@/lib/upload';

const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;
const TILE_COLORS = ['#E8703A', '#5B7A6B', '#E4DDD0', '#20201C'];

export function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const queryClient = useQueryClient();

  const photos = useQuery({
    queryKey: queryKeys.photos(id ?? ''),
    queryFn: () => api.getPhotos(id!),
    enabled: Boolean(id),
    refetchInterval: LIVE_POLL_MS,
  });

  const completedAt = group.data?.completedAt;
  const archived = Boolean(completedAt && Date.now() - new Date(completedAt).getTime() > ARCHIVE_GRACE_MS);
  const endedNotArchived = Boolean(completedAt) && !archived;

  const addPhoto = useMutation({
    mutationFn: async () => {
      const image = await pickImage();
      if (!image) return null;
      const storagePath = await uploadGroupPhoto(id!, image);
      return api.addPhoto(id!, storagePath);
    },
    onSuccess: (result) => {
      if (result) queryClient.setQueryData(queryKeys.photos(id!), result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.photos(id!) });
    },
  });

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={photos.isRefetching} onRefresh={() => void photos.refetch()} />}
    >
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
              {photo.url ? (
                <Image
                  source={{ uri: photo.url }}
                  style={{ aspectRatio: 1, width: '100%' }}
                  className="rounded-s bg-line"
                  accessibilityLabel={`Photo from ${photo.uploaderName}`}
                />
              ) : (
                <View
                  style={{ backgroundColor: TILE_COLORS[index % TILE_COLORS.length], aspectRatio: 1, opacity: 0.85 }}
                  className="rounded-s"
                />
              )}
              <Text className="mt-1 font-body text-[10px] text-muted">{photo.uploaderName}</Text>
            </View>
          ))}
          {photos.data.photos.length === 0 ? <Muted>No photos yet — be the first.</Muted> : null}
        </View>
      ) : null}

      {addPhoto.isError ? <ErrorState message={addPhoto.error.message} /> : null}
      {!archived ? (
        <Button
          label="Add a photo"
          variant="ghost"
          icon={<ImagePlus size={18} color="#20201C" />}
          loading={addPhoto.isPending}
          onPress={() => addPhoto.mutate()}
        />
      ) : null}
    </Screen>
  );
}

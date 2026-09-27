// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26.
// CHANGED Sep 26 (wave 2): real photos. expo-image-picker → Supabase Storage (event-photos/<groupId>/…, under
// the storage policies in migration 0007) → POST the path; the server answers with signed URLs to render.
// CHANGED Sep 26 (wave 3): tap a photo to open it full-screen (pinch to zoom, swipe between), and save it to the
// camera roll — download the signed URL to the cache with expo-file-system, hand it to expo-media-library.
import type { Photo } from '@degrees/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Directory, File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Download, ImagePlus, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Button, ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { api } from '@/lib/api';
import { queryKeys, useGroup } from '@/features/groups/queries';
import { LIVE_POLL_MS, usePullToRefresh } from '@/lib/query';
import { pickImage, uploadGroupPhoto } from '@/lib/upload';

const ARCHIVE_GRACE_MS = 24 * 60 * 60 * 1000;
const TILE_COLORS = ['#E8703A', '#5B7A6B', '#E4DDD0', '#20201C'];

// Downloads a signed photo URL into the app cache and adds it to the camera roll. Write-only permission is all
// that's needed ("Add Photos Only" on iOS).
async function savePhotoToLibrary(photo: Photo): Promise<void> {
  if (!photo.url) throw new Error('This photo has no download link yet — pull to refresh.');
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) {
    throw new Error('Allow adding photos in Settings to save this one.');
  }
  const extension = photo.storagePath.split('.').pop()?.toLowerCase() || 'jpg';
  const target = new File(new Directory(Paths.cache), `degrees-${photo.id}.${extension}`);
  if (target.exists) target.delete();
  const downloaded = await File.downloadFileAsync(photo.url, target);
  await MediaLibrary.saveToLibraryAsync(downloaded.uri);
}

function Viewer({
  photos,
  index,
  onClose,
}: {
  photos: Photo[];
  index: number | null;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index ?? 0);
  const { width, height } = Dimensions.get('window');
  const photo = photos[current];
  const save = useMutation({ mutationFn: (target: Photo) => savePhotoToLibrary(target) });

  return (
    <Modal visible={index !== null} animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen">
      <View className="flex-1 bg-ink">
        <FlatList
          data={photos}
          horizontal
          pagingEnabled
          initialScrollIndex={index ?? 0}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            setCurrent(Math.round(event.nativeEvent.contentOffset.x / width));
            save.reset();
          }}
          renderItem={({ item }) => (
            // A ScrollView with a zoom range gives native pinch-to-zoom on iOS without another dependency.
            <ScrollView
              style={{ width, height }}
              contentContainerStyle={{ width, height }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              bouncesZoom
            >
              {item.url ? (
                <Image
                  source={{ uri: item.url }}
                  style={{ width, height }}
                  resizeMode="contain"
                  accessibilityLabel={`Photo from ${item.uploaderName}`}
                />
              ) : (
                <View style={{ width, height }} className="items-center justify-center">
                  <Muted>This photo couldn't be loaded.</Muted>
                </View>
              )}
            </ScrollView>
          )}
        />

        <View className="absolute left-0 right-0 top-0 flex-row items-center justify-between px-5 pt-14">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
            onPress={onClose}
            className="h-10 w-10 items-center justify-center rounded-full bg-paper/20"
          >
            <X size={20} color="#F7F3EC" />
          </Pressable>
          <Text className="font-body-semibold text-sm text-paper">
            {current + 1} / {photos.length}
          </Text>
        </View>

        {photo ? (
          <View className="absolute bottom-0 left-0 right-0 gap-3 px-5 pb-12">
            <View>
              <Text className="font-body-semibold text-base text-paper">{photo.uploaderName}</Text>
              <Text className="font-body text-xs text-paper/70">
                {format(parseISO(photo.createdAt), 'EEE, MMM d · h:mm a')}
              </Text>
            </View>
            <Button
              label={save.isSuccess ? 'Saved to your photos' : 'Save to photos'}
              variant="secondary"
              icon={<Download size={18} color="#20201C" />}
              loading={save.isPending}
              disabled={save.isSuccess || !photo.url}
              onPress={() => save.mutate(photo)}
            />
            {save.isError ? <Text className="font-body text-sm text-ember">{save.error.message}</Text> : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

export function PhotosScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const group = useGroup(id);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<number | null>(null);

  const photos = useQuery({
    queryKey: queryKeys.photos(id ?? ''),
    queryFn: () => api.getPhotos(id!),
    enabled: Boolean(id),
    refetchInterval: LIVE_POLL_MS,
  });

  const pull = usePullToRefresh(photos.refetch);
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

  const list = photos.data?.photos ?? [];

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
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
          <Muted>Archived — you can still browse and save these, but new uploads are closed.</Muted>
        </View>
      ) : null}

      {photos.data ? (
        <View className="flex-row flex-wrap gap-2">
          {list.map((photo, index) => (
            <Pressable
              key={photo.id}
              style={{ width: '31%' }}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Open photo from ${photo.uploaderName}`}
              onPress={() => setOpen(index)}
            >
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
            </Pressable>
          ))}
          {list.length === 0 ? <Muted>No photos yet — be the first.</Muted> : null}
        </View>
      ) : null}
      {list.length > 0 ? <Muted>Tap a photo to see it full-size or save it.</Muted> : null}

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

      {open !== null ? <Viewer photos={list} index={open} onClose={() => setOpen(null)} /> : null}
    </Screen>
  );
}

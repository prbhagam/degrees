// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
// CHANGED Sep 26 (wave 3): works for meetups as well as matched groups, and contact exchange moved out to
// 1st-degree friends (Your Circle), where it's saved — this screen only collects the signal.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { FeedbackRelationship } from '@degrees/shared';
import { Star } from 'lucide-react-native';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, Chip, ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useGroup } from '@/features/groups/queries';

const GROUP_TAGS = ['Great vibe', 'Would hang again', 'Ran long', 'Hard to find'];
const RELATIONSHIP_OPTIONS: { value: FeedbackRelationship; label: string }[] = [
  { value: 'great', label: 'Great connection' },
  { value: 'fine', label: 'It was fine' },
  { value: 'not_for_me', label: 'Not for me' },
];

export function FeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const group = useGroup(id);
  const isMeetup = group.data?.kind === 'meetup';

  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [relationships, setRelationships] = useState<Record<string, FeedbackRelationship>>({});
  const [submitted, setSubmitted] = useState(false);

  const revealedPeers = (group.data?.members ?? []).filter(
    (member) => member.degree !== 0 && member.revealed && member.id,
  );

  const submit = useMutation({
    mutationFn: () =>
      api.submitFeedback(id!, {
        rating: rating as 1 | 2 | 3 | 4 | 5,
        peers: revealedPeers.map((member) => ({
          peerId: member.id!,
          relationship: relationships[member.id!] ?? 'fine',
        })),
        freeText: freeText || undefined,
      }),
    onSuccess: () => setSubmitted(true),
  });

  if (group.isPending) {
    return (
      <Screen>
        <LoadingState label="Loading…" />
      </Screen>
    );
  }
  if (group.isError) {
    return (
      <Screen>
        <ErrorState message={group.error.message} onRetry={() => void group.refetch()} />
      </Screen>
    );
  }

  if (submitted) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Feedback' }} />
        <View className="mt-16 items-center gap-2">
          <Text className="font-display text-2xl text-ink">Thanks!</Text>
          <Body className="text-center text-muted">
            This helps us plan your next hangout — and figure out who you'd like to keep hanging out
            with. Want their number? That happens from your 1st-degree friends.
          </Body>
          <Button label="Back to group" variant="secondary" className="mt-4" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Feedback' }} />

      <View>
        <Text className="font-body-semibold text-xs uppercase tracking-wider text-muted">
          {isMeetup ? 'How was the meetup overall?' : 'How was the group overall?'}
        </Text>
        <View className="mt-2.5 flex-row gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} accessibilityLabel={`Rate ${n}`}>
              <Star size={30} color={n <= rating ? '#E8703A' : '#E4DDD0'} fill={n <= rating ? '#E8703A' : 'none'} />
            </Pressable>
          ))}
        </View>
      </View>

      <View className="mt-5">
        <Text className="font-body-semibold text-xs uppercase tracking-wider text-muted">Any of these?</Text>
        <View className="mt-2.5 flex-row flex-wrap gap-2">
          {GROUP_TAGS.map((label) => (
            <Chip
              key={label}
              label={label}
              selected={tags.includes(label)}
              onPress={() => setTags((c) => (c.includes(label) ? c.filter((t) => t !== label) : [...c, label]))}
            />
          ))}
        </View>
      </View>

      {revealedPeers.length > 0 ? (
        <View className="mt-5">
          <Text className="font-body-semibold text-xs uppercase tracking-wider text-muted">
            How about each person?
          </Text>
          <View className="mt-2.5 gap-2.5">
            {revealedPeers.map((member) => (
              <Card key={member.id}>
                <Text className="font-body-semibold text-sm text-ink">{member.displayName}</Text>
                <View className="mt-2.5 flex-row gap-1.5">
                  {RELATIONSHIP_OPTIONS.map((option) => (
                    <Chip
                      key={option.value}
                      label={option.label}
                      selected={relationships[member.id!] === option.value}
                      onPress={() =>
                        setRelationships((current) => ({ ...current, [member.id!]: option.value }))
                      }
                    />
                  ))}
                </View>
              </Card>
            ))}
          </View>
        </View>
      ) : null}

      <View className="mt-5">
        <TextInput
          value={freeText}
          onChangeText={setFreeText}
          placeholder="Anything else worth knowing? (optional)"
          multiline
          numberOfLines={3}
          placeholderTextColor="#8A8378"
          className="rounded-m border border-line bg-paper-raised px-4 py-3.5 font-body text-base text-ink"
        />
      </View>

      {submit.isError ? (
        <ErrorState
          message={submit.error instanceof ApiError ? submit.error.message : 'Something went wrong.'}
        />
      ) : null}
      <Button
        label="Submit feedback"
        className="mt-5"
        loading={submit.isPending}
        disabled={rating === 0}
        onPress={() => submit.mutate()}
      />
    </Screen>
  );
}

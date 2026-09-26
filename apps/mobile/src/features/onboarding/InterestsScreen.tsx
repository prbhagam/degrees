// Owner: Charles (Onboarding & Profile) — see docs/ROLES.md.
import { useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { Body, Button, Chip, Field, Muted, Screen } from '@/components/ui';

const COMMON_INTERESTS = [
  'Hiking', 'Board Games', 'Live Music', 'Cooking', 'Climbing', 'Basketball',
  'Photography', 'Trivia Night', 'Thrifting', 'Running', 'Karaoke', 'Film Club',
  'Coffee Crawls', 'Pickup Soccer',
];

export function InterestsScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const all = [...COMMON_INTERESTS, ...custom];

  function toggle(label: string) {
    setSelected((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  function addCustom() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const match = all.find((label) => label.toLowerCase() === trimmed.toLowerCase());
    if (match) {
      if (!selected.includes(match)) toggle(match);
    } else {
      setCustom((current) => [...current, trimmed]);
      setSelected((current) => [...current, trimmed]);
    }
    setQuery('');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Interests', headerBackButtonDisplayMode: 'minimal' }} />
      <Muted>Step 1 of 3</Muted>
      <Text className="mt-2 font-display text-2xl text-ink">What are you into?</Text>
      <Body className="mt-1 text-muted">Pick a few, or add your own below.</Body>

      <View className="mt-4 flex-row items-center gap-2">
        <View className="flex-1">
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Search or add your own..."
            onSubmitEditing={addCustom}
          />
        </View>
        <Button label="Add" onPress={addCustom} className="px-5" />
      </View>
      <Muted className="mt-1.5">
        Common interests match you with a group faster. Specific ones still save to your profile.
      </Muted>

      <View className="mt-5 flex-row flex-wrap gap-2.5">
        {all.map((label) => (
          <Chip
            key={label}
            label={label}
            selected={selected.includes(label)}
            dashed={custom.includes(label) && !selected.includes(label)}
            onPress={() => toggle(label)}
          />
        ))}
      </View>

      <Muted className="mt-6">{selected.length} selected</Muted>
      <Button
        label="Next"
        className="mt-3"
        onPress={() =>
          router.push({
            pathname: '/onboarding/about',
            params: { tags: selected.join('|') },
          })
        }
      />
    </Screen>
  );
}

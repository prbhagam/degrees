// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26. PRD §9 named this a stretch goal
// ("the strongest answer to 'is this social media?'"); this assigns and builds it.
// Only ever shows 1st-degree connections (people actually met) — never the wider matching pool.
// CHANGED Sep 26 (wave 3): contact exchange lives here (saved server-side, POST /graph/exchange).
// CHANGED Sep 26 (wave 4): back to "Your circle" (the tab header carries the title, so the page doesn't repeat it).
// CHANGED Sep 26 (wave 5, Sahith): Play folded into Map. The map is now the physics graph (CircleGraph.tsx): drag
// anyone, fling them, watch the people who know each other pull together and the rest get pushed aside; tap to
// select. The static SVG map and the separate Play toggle are gone.
// CHANGED Sep 27 (wave 6, Sahith): everyone holds their spot and only you move (CircleGraph); copy to match.
import { useState } from 'react';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import { Pressable, RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUsPhone, type GraphResponse } from '@degrees/shared';
import { MessageSquare, Phone } from 'lucide-react-native';
import { Avatar, Button, ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { queryKeys, useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';
import { LIVE_POLL_MS, usePullToRefresh } from '@/lib/query';
import { CircleGraph } from './CircleGraph';

type Mode = 'list' | 'map';
type Node = GraphResponse['nodes'][number];
// Screen padding on each side (ui.tsx Screen: p-5).
const SCREEN_PAD = 20;
const GRAPH_HEIGHT = 340;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Mutual-consent number swap. One call marks your side yes; the number shows once both sides have said yes.
function ContactExchange({ node }: { node: Node }) {
  const queryClient = useQueryClient();
  const exchange = useMutation({
    mutationFn: () => api.exchangeContact(node.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.graph }),
  });
  const { requested, peerAccepted, peerPhone } = node.contact;
  const name = firstName(node.displayName);

  if (peerPhone) {
    const pretty = formatUsPhone(peerPhone);
    return (
      <View className="mt-3 gap-2 border-t border-line pt-3">
        <Text className="font-body-semibold text-xs uppercase tracking-wider text-sage">Numbers exchanged</Text>
        <Text className="font-display text-lg text-ink">{pretty}</Text>
        <View className="flex-row gap-2">
          <Button
            label="Text"
            variant="secondary"
            className="flex-1"
            icon={<MessageSquare size={16} color="#20201C" />}
            onPress={() => void Linking.openURL(`sms:${peerPhone}`)}
          />
          <Button
            label="Call"
            variant="secondary"
            className="flex-1"
            icon={<Phone size={16} color="#20201C" />}
            onPress={() => void Linking.openURL(`tel:${peerPhone}`)}
          />
        </View>
      </View>
    );
  }
  if (requested && peerAccepted) {
    return (
      <View className="mt-3 border-t border-line pt-3">
        <Muted>{name} agreed, but hasn't added a phone number yet.</Muted>
      </View>
    );
  }
  if (requested) {
    return (
      <View className="mt-3 border-t border-line pt-3">
        <Muted>You've shared your number. Waiting on {name} to share theirs — you'll see it here the moment they do.</Muted>
      </View>
    );
  }
  return (
    <View className="mt-3 gap-2 border-t border-line pt-3">
      {peerAccepted ? (
        <Text className="font-body-semibold text-sm text-ember-ink">{name} wants to exchange numbers with you.</Text>
      ) : (
        <Muted>Swap numbers to take it off-app. Nothing is shown until you've both said yes.</Muted>
      )}
      <Button
        label={peerAccepted ? 'Share mine too' : 'Exchange numbers'}
        variant={peerAccepted ? 'primary' : 'ghost'}
        loading={exchange.isPending}
        onPress={() => exchange.mutate()}
      />
      {exchange.isError ? <Muted>{exchange.error.message}</Muted> : null}
    </View>
  );
}

function PersonCard({ node, expanded, onPress }: { node: Node; expanded: boolean; onPress: () => void }) {
  const pending = !node.contact.requested && node.contact.peerAccepted;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`rounded-l border bg-paper-raised p-3.5 ${expanded ? 'border-ink' : 'border-line'}`}
    >
      <View className="flex-row items-center gap-3">
        <Avatar name={node.displayName} photoUrl={node.photoUrl} tone="met" />
        <View className="flex-1">
          <Text className="font-body-semibold text-sm text-ink">{node.displayName}</Text>
          <Muted>{node.metAt ? `Met at ${node.metAt}` : 'Met in person'}</Muted>
        </View>
        {node.contact.peerPhone ? (
          <Phone size={16} color="#5B7A6B" />
        ) : pending ? (
          <View className="rounded-full bg-ember/15 px-2 py-0.5">
            <Text className="font-body-semibold text-[10px] uppercase tracking-wider text-ember-ink">Wants your number</Text>
          </View>
        ) : null}
      </View>
      {expanded ? (
        <>
          {node.bio ? <Muted className="mt-2">{node.bio}</Muted> : null}
          <ContactExchange node={node} />
        </>
      ) : null}
    </Pressable>
  );
}

const MODES: { value: Mode; label: string }[] = [
  { value: 'list', label: 'List' },
  { value: 'map', label: 'Map' },
];

export function CircleScreen() {
  const [mode, setMode] = useState<Mode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bumped, setBumped] = useState<{ name: string; count: number } | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const me = useMe();
  // Wave 2: polls once a minute while focused (new "We met" taps land here) and pulls to refresh.
  const graph = useQuery({ queryKey: queryKeys.graph, queryFn: api.getGraph, refetchInterval: LIVE_POLL_MS });
  const pull = usePullToRefresh(graph.refetch);

  const nodes = graph.data?.nodes ?? [];
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const toggle = (id: string) => setSelectedId((current) => (current === id ? null : id));

  return (
    <Screen
      // The graph owns its touches; a scroll view fighting the drag would make it feel sticky.
      scrollEnabled={mode !== 'map'}
      refreshControl={mode === 'map' ? undefined : <RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} />}
    >
      <Stack.Screen options={{ title: 'Your circle' }} />

      <View className="flex-row items-center justify-between">
        <Muted>
          {nodes.length} {nodes.length === 1 ? 'person' : 'people'} at 1st degree
        </Muted>
        <View className="flex-row gap-1.5 rounded-full bg-line p-1">
          {MODES.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setMode(option.value)}
              className={`rounded-full px-3.5 py-1.5 ${mode === option.value ? 'bg-paper-raised' : ''}`}
            >
              <Text className={`font-body-semibold text-xs ${mode === option.value ? 'text-ink' : 'text-muted'}`}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {graph.isPending || me.isPending ? <LoadingState label="Loading your circle…" /> : null}
      {graph.isError ? <ErrorState message={graph.error.message} onRetry={() => void graph.refetch()} /> : null}

      {graph.data && mode === 'list' ? (
        <View className="mt-2 gap-2.5">
          {nodes.length === 0 ? (
            <Muted>Nobody yet — meet someone in person to start your circle.</Muted>
          ) : (
            nodes.map((node) => (
              <PersonCard key={node.id} node={node} expanded={selectedId === node.id} onPress={() => toggle(node.id)} />
            ))
          )}
        </View>
      ) : null}

      {graph.data && mode === 'map' ? (
        <View className="mt-1 items-center">
          <CircleGraph
            nodes={nodes}
            mutualEdges={graph.data.mutualEdges}
            width={windowWidth - SCREEN_PAD * 2}
            height={GRAPH_HEIGHT}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onBump={(name) => setBumped((current) => ({ name, count: (current?.count ?? 0) + 1 }))}
            mePhotoUrl={me.data?.photoUrl ?? null}
          />
          <View className="mt-2 min-h-10 items-center">
            {nodes.length === 0 ? (
              <Muted>Just you for now — meet someone in person and they'll appear here.</Muted>
            ) : bumped ? (
              <>
                <Text className="font-display-medium text-base text-ink">You bumped into {firstName(bumped.name)}</Text>
                <Muted>
                  {bumped.count} {bumped.count === 1 ? 'bump' : 'bumps'} · drag yourself around, tap anyone to open
                </Muted>
              </>
            ) : (
              <Muted>Drag your 0° into people. Green lines are friends who know each other.</Muted>
            )}
          </View>
          <View className="mt-1 w-full flex-row flex-wrap justify-center gap-x-5 gap-y-1">
            <View className="flex-row items-center gap-2">
              <View className="h-0.5 w-4 bg-line" />
              <Muted>Connected through you</Muted>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="h-0.5 w-4 bg-sage" />
              <Muted>They also know each other</Muted>
            </View>
          </View>
          {selected ? (
            <View className="mt-3 w-full">
              <PersonCard node={selected} expanded onPress={() => setSelectedId(null)} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

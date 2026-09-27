// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26. PRD §9 named this a stretch goal
// ("the strongest answer to 'is this social media?'"); this assigns and builds it.
// Only ever shows 1st-degree connections (people actually met) — never the wider matching pool.
// CHANGED Sep 26 (wave 3): this is "1st degree" in the app's own words (you are degree 0), and contact exchange
// lives here instead of on the feedback screen — the state is saved server-side (POST /graph/exchange) so a
// number you've swapped is still here next week, whichever group you met in.
import { Fragment, useState } from 'react';
import { Stack } from 'expo-router';
import * as Linking from 'expo-linking';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatUsPhone, type GraphResponse } from '@degrees/shared';
import { MessageSquare, Phone } from 'lucide-react-native';
import { Avatar, Button, ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { queryKeys, useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';
import { LIVE_POLL_MS } from '@/lib/query';

type Mode = 'list' | 'map';
type Node = GraphResponse['nodes'][number];

function polarPosition(index: number, total: number, radius: number, center: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

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
    // Both agreed but they have no phone on file.
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
          <Muted>1st degree{node.metAt ? ` · met at ${node.metAt}` : ''}</Muted>
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

export function CircleScreen() {
  const [mode, setMode] = useState<Mode>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const me = useMe();
  // Wave 2: polls once a minute while focused (new "We met" taps land here) and pulls to refresh.
  const graph = useQuery({ queryKey: queryKeys.graph, queryFn: api.getGraph, refetchInterval: LIVE_POLL_MS });

  const nodes = graph.data?.nodes ?? [];
  const size = 320;
  const center = size / 2;
  const positions = new Map(nodes.map((node, i) => [node.id, polarPosition(i, nodes.length || 1, 120, center)]));
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const toggle = (id: string) => setSelectedId((current) => (current === id ? null : id));

  return (
    <Screen refreshControl={<RefreshControl refreshing={graph.isRefetching} onRefresh={() => void graph.refetch()} />}>
      <Stack.Screen options={{ title: '1st degree' }} />

      <View className="flex-row items-center justify-between">
        <Text className="font-display text-2xl text-ink">1st-degree friends</Text>
        <View className="flex-row gap-1.5 rounded-full bg-line p-1">
          {(['list', 'map'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setMode(option)}
              className={`rounded-full px-3.5 py-1.5 ${mode === option ? 'bg-paper-raised' : ''}`}
            >
              <Text className={`font-body-semibold text-xs ${mode === option ? 'text-ink' : 'text-muted'}`}>
                {option === 'list' ? 'List' : 'Map'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Muted className="mt-1.5">
        {nodes.length} {nodes.length === 1 ? 'person' : 'people'} one degree from you — everyone you've met in person.
        It only grows after a hangout, and it's the only place you'll ever see someone's number.
      </Muted>

      {graph.isPending || me.isPending ? <LoadingState label="Loading your 1st degree…" /> : null}
      {graph.isError ? <ErrorState message={graph.error.message} onRetry={() => void graph.refetch()} /> : null}

      {graph.data && mode === 'list' ? (
        <View className="mt-4 gap-2.5">
          {nodes.length === 0 ? (
            <Muted>Nobody yet — you're degree 0. Meet someone in person to start your 1st degree.</Muted>
          ) : (
            nodes.map((node) => (
              <PersonCard key={node.id} node={node} expanded={selectedId === node.id} onPress={() => toggle(node.id)} />
            ))
          )}
        </View>
      ) : null}

      {graph.data && mode === 'map' ? (
        <View className="mt-4 items-center">
          <Svg width={size} height={size}>
            {nodes.map((node) => {
              const pos = positions.get(node.id)!;
              return <Line key={`spoke-${node.id}`} x1={center} y1={center} x2={pos.x} y2={pos.y} stroke="#E4DDD0" strokeWidth={1.5} />;
            })}
            {graph.data.mutualEdges.map((edge, i) => {
              const a = positions.get(edge.a);
              const b = positions.get(edge.b);
              if (!a || !b) return null;
              return <Line key={`mutual-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#5B7A6B" strokeWidth={2} />;
            })}
            <Circle cx={center} cy={center} r={24} fill="#E8703A" />
            <SvgText x={center} y={center + 4} fontSize={11} fontWeight="700" fill="#F7F3EC" textAnchor="middle">
              0°
            </SvgText>
            {nodes.map((node) => {
              const pos = positions.get(node.id)!;
              const initials = node.displayName
                .split(' ')
                .map((part) => part[0])
                .join('')
                .toUpperCase();
              return (
                <Fragment key={node.id}>
                  <Circle
                    cx={pos.x}
                    cy={pos.y}
                    r={19}
                    fill="#FFFFFF"
                    stroke="#20201C"
                    strokeWidth={1.5}
                    onPress={() => toggle(node.id)}
                  />
                  <SvgText
                    x={pos.x}
                    y={pos.y + 4}
                    fontSize={11}
                    fontWeight="700"
                    fill="#20201C"
                    textAnchor="middle"
                    onPress={() => toggle(node.id)}
                  >
                    {initials}
                  </SvgText>
                </Fragment>
              );
            })}
          </Svg>
          <View className="mt-3 gap-1.5">
            <View className="flex-row items-center gap-2">
              <View className="h-0.5 w-4 bg-line" />
              <Muted>1st degree — connected through you (degree 0)</Muted>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="h-0.5 w-4 bg-sage" />
              <Muted>They also know each other</Muted>
            </View>
          </View>
          {selected ? (
            <View className="mt-4 w-full">
              <PersonCard node={selected} expanded onPress={() => setSelectedId(null)} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

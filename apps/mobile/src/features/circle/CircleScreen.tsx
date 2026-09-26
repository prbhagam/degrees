// Owner: Pranav (Groups, Activities & Chat) — Added Sep 26. PRD §9 named this a stretch goal
// ("the strongest answer to 'is this social media?'"); this assigns and builds it.
// Only ever shows 1st-degree connections (people actually met) — never the wider matching pool.
import { Fragment, useState } from 'react';
import { Stack } from 'expo-router';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';
import { Pressable, Text, View } from 'react-native';
import { Avatar, ErrorState, LoadingState, Muted, Screen } from '@/components/ui';
import { useMe } from '@/features/groups/queries';
import { api } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

type Mode = 'list' | 'map';

function polarPosition(index: number, total: number, radius: number, center: number) {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

export function CircleScreen() {
  const [mode, setMode] = useState<Mode>('list');
  const me = useMe();
  const graph = useQuery({ queryKey: ['graph', 'me'], queryFn: api.getGraph });

  const nodes = graph.data?.nodes ?? [];
  const size = 320;
  const center = size / 2;
  const positions = new Map(nodes.map((node, i) => [node.id, polarPosition(i, nodes.length || 1, 120, center)]));

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Your circle' }} />

      <View className="flex-row items-center justify-between">
        <Text className="font-display text-2xl text-ink">Your circle</Text>
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
      <Muted className="mt-1.5">{nodes.length} people you've actually met — this only grows after a hangout.</Muted>

      {graph.isPending || me.isPending ? <LoadingState label="Loading your circle…" /> : null}
      {graph.isError ? <ErrorState message={graph.error.message} onRetry={() => void graph.refetch()} /> : null}

      {graph.data && mode === 'list' ? (
        <View className="mt-4 gap-2.5">
          {nodes.length === 0 ? (
            <Muted>Nobody yet — meet someone in person to start your circle.</Muted>
          ) : (
            nodes.map((node) => (
              <View key={node.id} className="flex-row items-center gap-3 rounded-l border border-line bg-paper-raised p-3.5">
                <Avatar name={node.displayName} tone="met" />
                <View className="flex-1">
                  <Text className="font-body-semibold text-sm text-ink">{node.displayName}</Text>
                  {node.metAt ? <Muted>Met at {node.metAt}</Muted> : null}
                </View>
              </View>
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
              YOU
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
                  <Circle cx={pos.x} cy={pos.y} r={19} fill="#FFFFFF" stroke="#20201C" strokeWidth={1.5} />
                  <SvgText x={pos.x} y={pos.y + 4} fontSize={11} fontWeight="700" fill="#20201C" textAnchor="middle">
                    {initials}
                  </SvgText>
                </Fragment>
              );
            })}
          </Svg>
          <View className="mt-3 gap-1.5">
            <View className="flex-row items-center gap-2">
              <View className="h-0.5 w-4 bg-line" />
              <Muted>Connected through you</Muted>
            </View>
            <View className="flex-row items-center gap-2">
              <View className="h-0.5 w-4 bg-sage" />
              <Muted>They also know each other</Muted>
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

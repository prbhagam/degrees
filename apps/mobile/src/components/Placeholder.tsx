// Owner: shared mobile scaffold (Charles) — temporary placeholder; delete once every screen is real.
import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';

interface PlaceholderProps {
  title: string;
  owner: string;
  purpose: string;
  children?: ReactNode;
}

export function Placeholder({
  title,
  owner,
  purpose,
  children,
}: PlaceholderProps) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="gap-3 p-6"
    >
      <Text className="text-2xl font-semibold">{title}</Text>
      <Text className="text-sm text-neutral-500">Owner: {owner}</Text>
      <Text className="text-base">{purpose}</Text>
      {children ? <View className="mt-4 gap-2">{children}</View> : null}
    </ScrollView>
  );
}

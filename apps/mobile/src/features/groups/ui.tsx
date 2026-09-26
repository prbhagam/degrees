// Owner: Pranav (Groups, Activities & Chat) — small UI kit shared by events, groups, activity, and chat.
// Swap these for Charles's component kit once it lands; the props are deliberately plain.
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewProps,
} from 'react-native';
import { degreeStyle } from './degrees';

export function Screen({
  children,
  ...props
}: ScrollViewProps & { children: ReactNode }) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-neutral-50 dark:bg-neutral-950"
      contentContainerClassName="gap-4 p-5 pb-12"
      keyboardShouldPersistTaps="handled"
      {...props}
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      {children}
    </View>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {children}
    </Text>
  );
}

export function Body({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={`text-base leading-6 text-neutral-800 dark:text-neutral-200 ${className}`}
    >
      {children}
    </Text>
  );
}

export function Muted({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={`text-sm text-neutral-500 dark:text-neutral-400 ${className}`}
    >
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const buttonStyles: Record<ButtonVariant, { box: string; text: string }> = {
  primary: { box: 'bg-violet-600 active:bg-violet-700', text: 'text-white' },
  secondary: {
    box: 'border border-neutral-300 bg-white active:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:active:bg-neutral-800',
    text: 'text-neutral-900 dark:text-white',
  },
  ghost: {
    box: 'active:bg-violet-50 dark:active:bg-violet-950',
    text: 'text-violet-600 dark:text-violet-400',
  },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  className = '',
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  const style = buttonStyles[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${style.box} ${inactive ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? 'white' : undefined}
        />
      ) : (
        icon
      )}
      <Text className={`text-base font-semibold ${style.text}`}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label }: { label: string }) {
  return (
    <View className="rounded-full bg-neutral-100 px-3 py-1 dark:bg-neutral-800">
      <Text className="text-sm text-neutral-700 dark:text-neutral-300">
        {label}
      </Text>
    </View>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function Avatar({
  name,
  degree,
  size = 'md',
}: {
  name: string;
  degree: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const box = { sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-16 w-16' }[size];
  const text = { sm: 'text-xs', md: 'text-base', lg: 'text-xl' }[size];
  return (
    <View
      className={`${box} items-center justify-center rounded-full ${degreeStyle(degree).avatar}`}
    >
      <Text className={`${text} font-bold ${degreeStyle(degree).avatarText}`}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function DegreeBadge({ degree }: { degree: number }) {
  const style = degreeStyle(degree);
  return (
    <View className={`rounded-full px-2 py-0.5 ${style.badge}`}>
      <Text className={`text-xs font-semibold ${style.badgeText}`}>
        {style.label}
      </Text>
    </View>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <View className="items-center gap-3 py-16">
      <ActivityIndicator size="large" />
      <Muted>{label}</Muted>
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="items-center">
      <Body className="text-center">{message}</Body>
      {onRetry ? (
        <Button label="Try again" variant="secondary" onPress={onRetry} />
      ) : null}
    </Card>
  );
}

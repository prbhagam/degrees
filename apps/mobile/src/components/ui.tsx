// Owner: shared mobile scaffold (Charles) — the app's one UI kit. Was src/features/groups/ui.tsx;
// moved here because every feature uses it, not just groups. CHANGED Sep 26: restyled from the
// original violet/rounded-2xl look to the validated ember/paper/Fraunces+PublicSans design.
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps,
  type TextProps,
} from 'react-native';
import { Eye, EyeOff, Lock, Minus, Plus } from 'lucide-react-native';

export function Screen({
  children,
  ...props
}: ScrollViewProps & { children: ReactNode }) {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-paper"
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
    <View className={`gap-3 rounded-l border border-line bg-paper-raised p-4 ${className}`}>
      {children}
    </View>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text className="font-body-semibold text-xs uppercase tracking-wider text-muted">
      {children}
    </Text>
  );
}

export function Title({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Text className={`font-display text-2xl text-ink ${className}`}>{children}</Text>;
}

export function Body({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Text className={`font-body text-base leading-6 text-ink ${className}`}>{children}</Text>;
}

export function Muted({
  children,
  className = '',
  ...props
}: {
  children: ReactNode;
  className?: string;
} & Pick<TextProps, 'numberOfLines'>) {
  return (
    <Text className={`font-body text-sm text-muted ${className}`} {...props}>
      {children}
    </Text>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const buttonStyles: Record<ButtonVariant, { box: string; text: string }> = {
  primary: { box: 'bg-ink active:opacity-85', text: 'text-paper' },
  secondary: {
    box: 'border border-line bg-paper-raised active:bg-paper',
    text: 'text-ink',
  },
  ghost: {
    box: 'border border-line bg-transparent active:bg-paper',
    text: 'text-ink',
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
      className={`min-h-12 flex-row items-center justify-center gap-2 rounded-l px-4 py-3 ${style.box} ${inactive ? 'opacity-50' : ''} ${className}`}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? '#F7F3EC' : '#20201C'} /> : icon}
      <Text className={`font-body-semibold text-base ${style.text}`}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  dashed = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  dashed?: boolean;
}) {
  const box = selected
    ? 'bg-ink border-ink'
    : dashed
      ? 'bg-paper-raised border-line border-dashed'
      : 'bg-paper-raised border-line';
  const text = selected ? 'text-paper' : 'text-ink';
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      {...(onPress ? { onPress, accessibilityRole: 'button' as const } : {})}
      className={`min-h-10 rounded-full border px-4 py-2 ${box}`}
    >
      <Text className={`font-body-semibold text-sm ${text}`}>{label}</Text>
    </Wrapper>
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
  photoUrl = null,
  size = 'md',
  tone = 'met',
  locked = false,
}: {
  name: string;
  photoUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'you' | 'met' | 'unmet';
  locked?: boolean;
}) {
  const box = { sm: 'h-8 w-8', md: 'h-11 w-11', lg: 'h-16 w-16' }[size];
  const text = { sm: 'text-xs', md: 'text-base', lg: 'text-xl' }[size];
  const iconSize = { sm: 14, md: 18, lg: 26 }[size];
  const boxStyle =
    tone === 'you'
      ? 'bg-ink'
      : locked || tone === 'unmet'
        ? 'border-2 border-dashed border-line bg-paper'
        : 'bg-sage';
  const textColor = tone === 'you' || (!locked && tone === 'met') ? 'text-paper' : 'text-muted';
  if (!locked && photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        className={`${box} rounded-full`}
        accessibilityLabel={name}
      />
    );
  }
  return (
    <View className={`${box} items-center justify-center rounded-full ${boxStyle}`}>
      {locked ? (
        <Lock size={iconSize} color="#8A8378" />
      ) : (
        <Text className={`font-body-bold ${text} ${textColor}`}>{initials(name)}</Text>
      )}
    </View>
  );
}

export function DegreeBadge({ label, tone = 'met' }: { label: string; tone?: 'you' | 'met' | 'unmet' }) {
  const box =
    tone === 'you' ? 'bg-ink' : tone === 'unmet' ? 'border border-line bg-paper' : 'border border-line bg-paper-raised';
  const text = tone === 'you' ? 'text-paper' : tone === 'unmet' ? 'text-muted' : 'text-sage';
  return (
    <View className={`rounded-full px-2 py-0.5 ${box}`}>
      <Text className={`font-body-semibold text-xs ${text}`}>{label}</Text>
    </View>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <View className="items-center gap-3 py-16">
      <ActivityIndicator size="large" color="#E8703A" />
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
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

export function SectionRow({
  title,
  subtitle,
  right,
  onPress,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      {...(onPress ? { onPress, accessibilityRole: 'button' as const } : {})}
      className="flex-row items-center justify-between border-b border-line px-4 py-4 last:border-b-0"
    >
      <View className="flex-shrink pr-3">
        <Text className="font-body-semibold text-[15px] text-ink">{title}</Text>
        {subtitle ? <Muted className="mt-0.5">{subtitle}</Muted> : null}
      </View>
      {right}
    </Wrapper>
  );
}

export function Stepper({
  value,
  onDecrement,
  onIncrement,
  min,
  max,
}: {
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
  min?: number;
  max?: number;
}) {
  const canDecrement = min === undefined || value > min;
  const canIncrement = max === undefined || value < max;
  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        disabled={!canDecrement}
        onPress={onDecrement}
        className={`h-9 w-9 items-center justify-center rounded-full border border-line bg-paper-raised ${canDecrement ? '' : 'opacity-40'}`}
      >
        <Minus size={16} color="#20201C" />
      </Pressable>
      {/* CHANGED Sep 26 (wave 2): was w-4 (16px), which squeezed two-digit values and let the row collapse. */}
      <Text className="font-body-semibold min-w-7 text-center text-base text-ink">{value}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        disabled={!canIncrement}
        onPress={onIncrement}
        className={`h-9 w-9 items-center justify-center rounded-full border border-line bg-paper-raised ${canIncrement ? '' : 'opacity-40'}`}
      >
        <Plus size={16} color="#20201C" />
      </Pressable>
    </View>
  );
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View className="flex-row gap-1.5 rounded-full bg-line p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            onPress={() => onChange(option.value)}
            className={`flex-1 items-center rounded-full py-2 ${active ? 'bg-paper-raised' : ''}`}
          >
            <Text className={`font-body-semibold text-xs ${active ? 'text-ink' : 'text-muted'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  hint,
  secureTextEntry,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  // Added Sep 26 (wave 2): password fields get a show/hide toggle.
  const [revealed, setRevealed] = useState(false);
  const secure = Boolean(secureTextEntry);
  return (
    <View className="gap-1.5">
      {label ? <Text className="font-body-semibold text-[13px] text-muted">{label}</Text> : null}
      <View>
        <TextInput
          // CHANGED Sep 26: py-3.5 with no explicit line-height let the OS center the cursor/typed
          // text against the font's natural line box, which sits higher than the placeholder text —
          // visible as soon as you start typing. Fixed line-height + textAlignVertical keeps both
          // aligned the same way in every state (empty, placeholder, typed, multiline).
          className={`rounded-m border border-line bg-paper-raised px-4 py-3 font-body text-base leading-5 text-ink ${secure ? 'pr-12' : ''}`}
          style={{ textAlignVertical: props.multiline ? 'top' : 'center' }}
          placeholderTextColor="#8A8378"
          secureTextEntry={secure && !revealed}
          {...props}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            onPress={() => setRevealed((value) => !value)}
            hitSlop={8}
            className="absolute right-3 top-0 h-full justify-center"
          >
            {revealed ? <EyeOff size={18} color="#8A8378" /> : <Eye size={18} color="#8A8378" />}
          </Pressable>
        ) : null}
      </View>
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

// Owner: Pranav (Groups, Activities & Chat) — Added Sep 27 (Sahith). The date/time picker behind "Propose a time".
// It replaces a single iOS `datetime` spinner, which testing called "completely messed up — structure, colors, form":
//   * structure: the combined wheel is a fixed ~320pt-wide native view with four columns, squeezed inside a padded
//     card, so it clipped and misaligned;
//   * colours: it had no theme, so on a phone in dark mode it drew light text on the app's light paper.
// Now it's built from the app's own pieces: a day strip (the next two weeks as chips, plus the native calendar for
// anything later) and common times as chips (plus a narrow time-only wheel for anything else). The native parts are
// pinned to the light theme with the app's ink and ember, whatever the phone's appearance.
import DateTimePicker, { type DateTimePickerChangeEvent } from '@react-native-community/datetimepicker';
import { addDays, addMinutes, format, isSameDay, isToday, isTomorrow, setHours, setMinutes, startOfDay } from 'date-fns';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Chip, Muted } from '@/components/ui';

const DAYS_SHOWN = 14;
// [hours, minutes] — the times a group of students actually meets up.
const COMMON_TIMES: [number, number][] = [
  [10, 0],
  [12, 30],
  [15, 0],
  [17, 30],
  [19, 0],
  [20, 30],
];
const INK = '#20201C';
const EMBER = '#E8703A';

// Round "now" up to the next quarter hour for a sensible default.
export function nextQuarterHour(from = new Date()): Date {
  const rounded = addMinutes(from, 15 - (from.getMinutes() % 15));
  rounded.setSeconds(0, 0);
  return rounded;
}

function withTime(day: Date, hours: number, minutes: number): Date {
  return setMinutes(setHours(startOfDay(day), hours), minutes);
}

function dayLabel(day: Date): { top: string; bottom: string } {
  if (isToday(day)) return { top: 'Today', bottom: format(day, 'MMM d') };
  if (isTomorrow(day)) return { top: 'Tmrw', bottom: format(day, 'MMM d') };
  return { top: format(day, 'EEE'), bottom: format(day, 'MMM d') };
}

function DayChip({ day, selected, onPress }: { day: Date; selected: boolean; onPress: () => void }) {
  const { top, bottom } = dayLabel(day);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={format(day, 'EEEE, MMMM d')}
      onPress={onPress}
      className={`w-16 items-center gap-0.5 rounded-m border py-2 ${selected ? 'border-ink bg-ink' : 'border-line bg-paper-raised'}`}
    >
      <Text className={`font-body-semibold text-[13px] ${selected ? 'text-paper' : 'text-ink'}`}>{top}</Text>
      <Text className={`font-body text-[11px] ${selected ? 'text-paper' : 'text-muted'}`}>{bottom}</Text>
    </Pressable>
  );
}

export function WhenPicker({ value, onChange }: { value: Date; onChange: (next: Date) => void }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [wheelOpen, setWheelOpen] = useState(false);
  const now = new Date();
  const days = Array.from({ length: DAYS_SHOWN }, (_, index) => addDays(startOfDay(now), index));
  const pickedLater = !days.some((day) => isSameDay(day, value));

  // Keep the chosen time of day when the day changes; if that's already gone (today, earlier), take the next slot.
  const pickDay = (day: Date) => {
    const next = withTime(day, value.getHours(), value.getMinutes());
    onChange(next.getTime() > Date.now() ? next : nextQuarterHour());
  };
  const onCalendar = (_event: DateTimePickerChangeEvent, date: Date) => {
    pickDay(date);
    setCalendarOpen(false);
  };
  const onWheel = (_event: DateTimePickerChangeEvent, date: Date) => {
    onChange(withTime(value, date.getHours(), date.getMinutes()));
  };

  return (
    <View className="gap-3">
      <Text className="font-display text-xl text-ink">{format(value, 'EEEE, MMM d · h:mm a')}</Text>

      <View className="gap-2">
        <Muted>Day</Muted>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-2">
          {days.map((day) => (
            <DayChip key={day.toISOString()} day={day} selected={isSameDay(day, value)} onPress={() => pickDay(day)} />
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => setCalendarOpen((open) => !open)}
            className={`w-20 items-center justify-center rounded-m border py-2 ${pickedLater ? 'border-ink bg-ink' : 'border-dashed border-line bg-paper-raised'}`}
          >
            <Text className={`font-body-semibold text-[13px] ${pickedLater ? 'text-paper' : 'text-ink'}`}>
              {pickedLater ? format(value, 'MMM d') : 'Later…'}
            </Text>
          </Pressable>
        </ScrollView>
        {calendarOpen ? (
          <View className="overflow-hidden rounded-m border border-line bg-paper-raised">
            <DateTimePicker
              value={value}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              minimumDate={startOfDay(now)}
              themeVariant="light"
              accentColor={EMBER}
              textColor={INK}
              onValueChange={onCalendar}
              onDismiss={() => setCalendarOpen(false)}
            />
          </View>
        ) : null}
      </View>

      <View className="gap-2">
        <Muted>Time</Muted>
        <View className="flex-row flex-wrap gap-2">
          {COMMON_TIMES.map(([hours, minutes]) => {
            const at = withTime(value, hours, minutes);
            const selected = value.getHours() === hours && value.getMinutes() === minutes;
            const past = at.getTime() <= Date.now();
            return (
              <View key={`${hours}:${minutes}`} className={past ? 'opacity-40' : ''}>
                <Chip
                  label={format(at, 'h:mm a')}
                  selected={selected}
                  onPress={past ? undefined : () => onChange(at)}
                />
              </View>
            );
          })}
          <Chip label={wheelOpen ? 'Done' : 'Other time'} dashed={!wheelOpen} onPress={() => setWheelOpen((open) => !open)} />
        </View>
        {wheelOpen ? (
          <View className="items-center rounded-m border border-line bg-paper-raised">
            <DateTimePicker
              value={value}
              mode="time"
              display="spinner"
              minuteInterval={15}
              themeVariant="light"
              textColor={INK}
              onValueChange={onWheel}
              onDismiss={() => setWheelOpen(false)}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

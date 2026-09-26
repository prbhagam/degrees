// Owner: Pranav (Groups, Activities & Chat) — display formatting for Activity fields (money is integer cents).
import { format, isToday, isTomorrow, parseISO } from 'date-fns';

export function formatPrice(priceCents: number | null): string {
  if (priceCents === null) {
    return 'Price varies';
  }
  if (priceCents === 0) {
    return 'Free';
  }
  const dollars = priceCents / 100;
  return `$${priceCents % 100 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)} / person`;
}

export function formatStartsAt(startsAt: string | null): string {
  if (!startsAt) {
    return 'Whenever works';
  }
  const date = parseISO(startsAt);
  const time = format(date, 'h:mm a');
  if (isToday(date)) {
    return `Today · ${time}`;
  }
  if (isTomorrow(date)) {
    return `Tomorrow · ${time}`;
  }
  return format(date, 'EEE, MMM d · h:mm a');
}

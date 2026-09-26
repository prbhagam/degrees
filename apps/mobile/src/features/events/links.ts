// Owner: Pranav (Groups, Activities & Chat) — deep links encoded in QR codes, and parsing what the scanner reads.
import * as Linking from 'expo-linking';

// createURL yields degrees://join/HACKGT in dev and TestFlight builds, and exp://<ip>:8081/--/join/HACKGT in Expo Go,
// so a code scanned with the iPhone Camera opens whichever app is running this bundle.
export function joinLink(roomCode: string): string {
  return Linking.createURL(`join/${encodeURIComponent(roomCode)}`);
}

// The name is display-only (there's no endpoint to look a person up by id); the server trusts only the id.
// CHANGED Sep 26: a connection must be tied to the event both people are at — see session.ts's
// `activeEvent`. `eventId`/`eventName` are optional only because a caller with no active event
// can't embed one; ConnectScreen refuses to show a code in that case instead of connecting blind.
export function connectLink(
  userId: string,
  displayName: string,
  event?: { id: string; name: string },
): string {
  return Linking.createURL(`connect/${userId}`, {
    queryParams: {
      name: displayName,
      ...(event ? { eventId: event.id, eventName: event.name } : {}),
    },
  });
}

export type ScanTarget =
  | { kind: 'join'; roomCode: string }
  | { kind: 'connect'; peerId: string; name?: string; eventId?: string; eventName?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROOM_CODE = /^[A-Z0-9]{3,16}$/i;

// Accepts degrees:// and exp:// links from either QR type, or a bare room code printed as a QR.
export function parseScan(data: string): ScanTarget | null {
  const text = data.trim();
  if (ROOM_CODE.test(text)) {
    return { kind: 'join', roomCode: text.toUpperCase() };
  }
  const match = text.match(/(?:^|\/)(join|connect)\/([^/?#]+)/i);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const value = decodeURIComponent(match[2]);
  if (match[1].toLowerCase() === 'join') {
    return ROOM_CODE.test(value)
      ? { kind: 'join', roomCode: value.toUpperCase() }
      : null;
  }
  if (!UUID.test(value)) {
    return null;
  }
  const params = Linking.parse(text).queryParams ?? {};
  const name = params.name;
  const eventId = params.eventId;
  const eventName = params.eventName;
  return {
    kind: 'connect',
    peerId: value,
    ...(typeof name === 'string' ? { name } : {}),
    ...(typeof eventId === 'string' ? { eventId } : {}),
    ...(typeof eventName === 'string' ? { eventName } : {}),
  };
}

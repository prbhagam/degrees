// Owner: Pranav (Groups, Activities & Chat) — see docs/ROLES.md.
import { useParams } from 'react-router';

export function JoinPage() {
  const { roomCode } = useParams();
  return <h1>Pranav: join event {roomCode ?? 'by room code'} placeholder</h1>;
}

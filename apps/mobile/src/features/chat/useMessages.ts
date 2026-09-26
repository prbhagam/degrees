// Owner: Pranav (Groups, Activities & Chat) — chat data: API for history + sends, Supabase Realtime for live inserts.
import type { Message, MessagesResponse } from '@degrees/shared';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  currentSession,
  queryKeys,
  useGroup,
  useMe,
} from '@/features/groups/queries';
import { api } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabase';

// Without Realtime (mock mode, signed out, or a dropped socket) the list polls instead.
const POLL_MS = 3_000;

interface MessageRow {
  id: number | string;
  group_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

// Server-confirmed messages only (never optimistic); dedupe by id because a send can arrive via both paths.
function mergeMessages(
  queryClient: QueryClient,
  groupId: string,
  incoming: Message[],
): void {
  queryClient.setQueryData<MessagesResponse>(
    queryKeys.messages(groupId),
    (previous) => {
      const byId = new Map(
        (previous?.messages ?? []).map((message) => [message.id, message]),
      );
      for (const message of incoming) {
        byId.set(message.id, message);
      }
      return {
        messages: [...byId.values()].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
      };
    },
  );
}

export function useMessages(groupId: string) {
  const queryClient = useQueryClient();
  const me = useMe();
  const group = useGroup(groupId);
  const [live, setLive] = useState(false);

  const messages = useQuery({
    queryKey: queryKeys.messages(groupId),
    queryFn: () => api.getMessages(groupId),
    refetchInterval: live ? false : POLL_MS,
  });

  // Realtime rows carry sender_id only; names come from the group roster. A ref keeps roster refetches from
  // tearing down the subscription.
  const members = useRef(group.data?.members);
  useEffect(() => {
    members.current = group.data?.members;
  }, [group.data?.members]);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void currentSession().then((session) => {
      if (cancelled || !session) {
        return;
      }
      const supabase = getSupabaseClient();
      const nameOf = (senderId: string) =>
        members.current?.find(({ id }) => id === senderId)?.displayName ??
        'Someone';
      const channel = supabase
        .channel(`group-messages:${groupId}`)
        .on<MessageRow>(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `group_id=eq.${groupId}`,
          },
          ({ new: row }) => {
            mergeMessages(queryClient, groupId, [
              {
                id: String(row.id),
                senderId: row.sender_id,
                senderName: nameOf(row.sender_id),
                body: row.body,
                createdAt: new Date(row.created_at).toISOString(),
              },
            ]);
          },
        )
        .subscribe((status) => {
          const connected = status === 'SUBSCRIBED';
          setLive(connected);
          if (connected) {
            // Catch anything sent between the initial fetch and the subscription going live.
            void queryClient.invalidateQueries({
              queryKey: queryKeys.messages(groupId),
            });
          }
        });
      cleanup = () => {
        setLive(false);
        void supabase.removeChannel(channel);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [groupId, queryClient]);

  const send = useMutation({
    mutationFn: (body: string) => api.sendMessage(groupId, { body }),
    onSuccess: ({ id, createdAt }, body) => {
      if (!me.data) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.messages(groupId),
        });
        return;
      }
      mergeMessages(queryClient, groupId, [
        {
          id,
          createdAt,
          body,
          senderId: me.data.id,
          senderName: me.data.displayName ?? me.data.username,
        },
      ]);
    },
  });

  return { messages, send, me: me.data, live };
}

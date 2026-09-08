import { useEffect, useRef } from "react";
import { realtimeClient } from "@/lib/realtimeClient";
import type { RealtimeEventName, RealtimeMessage } from "@/lib/realtimeEvents";

const FALLBACK_POLL_MS = 5000;

export function useRealtime(
  events: RealtimeEventName[] | "all",
  onEvent: (message: RealtimeMessage) => void,
): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const eventsKey = events === "all" ? "all" : events.join(",");

  useEffect(() => {
    const wanted = events === "all" ? null : new Set(events);
    const unsubscribe = realtimeClient.subscribe((message) => {
      if (wanted && !wanted.has(message.event)) {
        return;
      }
      handlerRef.current(message);
    });
    const fallback = setInterval(() => {
      if (realtimeClient.connected) {
        return;
      }
      handlerRef.current({ event: wanted ? [...wanted][0]! : "queue:updated", ts: new Date().toISOString() });
    }, FALLBACK_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(fallback);
    };
  }, [eventsKey]);
}

import { nextReconnectDelayMs, type RealtimeMessage } from "./realtimeEvents";

type Listener = (message: RealtimeMessage) => void;

function websocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export class RealtimeClient {
  private socket: WebSocket | null = null;
  private readonly listeners = new Set<Listener>();
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  connected = false;

  start(): void {
    if (!this.stopped && this.socket) {
      return;
    }
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnect();
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  private open(): void {
    if (this.stopped) {
      return;
    }
    this.clearReconnect();
    try {
      this.socket = new WebSocket(websocketUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket.addEventListener("open", () => {
      this.connected = true;
      this.attempt = 0;
    });
    this.socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data)) as RealtimeMessage;
        if (!message?.event) {
          return;
        }
        for (const listener of this.listeners) {
          listener(message);
        }
      } catch {
        // Ignore malformed frames.
      }
    });
    this.socket.addEventListener("close", () => {
      this.connected = false;
      this.socket = null;
      this.scheduleReconnect();
    });
    this.socket.addEventListener("error", () => {
      this.socket?.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const delay = nextReconnectDelayMs(this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

export const realtimeClient = new RealtimeClient();

import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import {
  REALTIME_PATH,
  type IRealtimeHub,
  type RealtimeMessage,
} from "../realtime/events.js";

export class RealtimeHub implements IRealtimeHub {
  private readonly clients = new Set<WebSocket>();
  private server: WebSocketServer | null = null;

  attach(httpServer: HttpServer): void {
    if (this.server) {
      return;
    }
    this.server = new WebSocketServer({ noServer: true });
    this.server.on("connection", (socket) => {
      this.clients.add(socket);
      socket.on("close", () => {
        this.clients.delete(socket);
      });
      socket.on("error", () => {
        this.clients.delete(socket);
      });
    });
    httpServer.on("upgrade", (request: IncomingMessage, socket, head) => {
      const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "";
      if (pathname !== REALTIME_PATH) {
        return;
      }
      this.server?.handleUpgrade(request, socket, head, (websocket) => {
        this.server?.emit("connection", websocket, request);
      });
    });
  }

  publish(message: Omit<RealtimeMessage, "ts">): void {
    const payload: RealtimeMessage = { ...message, ts: new Date().toISOString() };
    const encoded = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(encoded);
      }
    }
  }

  clientCount(): number {
    return this.clients.size;
  }

  close(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
    this.server?.close();
    this.server = null;
  }
}

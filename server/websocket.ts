/**
 * WebSocket Service for Real-Time Notifications
 * 
 * This service manages WebSocket connections and broadcasts notifications
 * to connected clients in real-time.
 */

import { Server as HTTPServer } from "http";
import { Server as SocketIOServer } from "socket.io";

let io: SocketIOServer | null = null;

/**
 * Initialize WebSocket server
 */
export function initializeWebSocket(server: HTTPServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*", // In production, restrict this to your domain
      methods: ["GET", "POST"],
    },
    path: "/api/socket.io",
  });

  io.on("connection", (socket) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });

    // Send welcome message
    socket.emit("connected", {
      message: "Connected to InverseIQ notification service",
      timestamp: new Date().toISOString(),
    });
  });

  console.log("[WebSocket] Server initialized");
  return io;
}

/**
 * Broadcast notification to all connected clients
 */
export function broadcastNotification(notification: {
  id: number;
  type: string;
  title: string;
  message: string;
  signalId?: number;
  metadata?: string;
  createdAt: Date;
}) {
  if (!io) {
    console.warn("[WebSocket] Cannot broadcast: server not initialized");
    return;
  }

  console.log(`[WebSocket] Broadcasting notification: ${notification.title}`);
  io.emit("notification", notification);
}

/**
 * Broadcast signal update to all connected clients
 */
export function broadcastSignalUpdate(signal: {
  id: number;
  symbol: string;
  direction: string;
  outcome: string;
  confidence: number;
}) {
  if (!io) {
    console.warn("[WebSocket] Cannot broadcast: server not initialized");
    return;
  }

  console.log(`[WebSocket] Broadcasting signal update: ${signal.symbol} - ${signal.outcome}`);
  io.emit("signal_update", signal);
}

/**
 * Get WebSocket server instance
 */
export function getWebSocketServer() {
  return io;
}

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { shouldSurfaceNotification, shouldUseBrowserNotification } from "@/lib/notificationPreferenceFilter";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  signalId?: number | null;
  isRead: number;
  createdAt: Date;
  metadata?: string | null;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isConnected: boolean;
  markAsRead: (notificationId: number) => void;
  markAllAsRead: () => void;
  refreshNotifications: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const { data: notificationsData, refetch } = trpc.notifications.list.useQuery({
    limit: 50,
  });
  const { data: notificationPreferences } = trpc.notificationPreferences.get.useQuery();
  const preferencesRef = useRef(notificationPreferences);

  useEffect(() => {
    preferencesRef.current = notificationPreferences;
  }, [notificationPreferences]);

  const markAsReadMutation = trpc.notifications.markAsRead.useMutation();
  const markAllAsReadMutation = trpc.notifications.markAllAsRead.useMutation();

  // Initialize WebSocket connection
  useEffect(() => {
    const socketInstance = io({
      path: "/api/socket.io",
      transports: ["websocket", "polling"],
    });

    socketInstance.on("connect", () => {
      console.log("[Notifications] WebSocket connected");
      setIsConnected(true);
    });

    socketInstance.on("disconnect", () => {
      console.log("[Notifications] WebSocket disconnected");
      setIsConnected(false);
    });

    socketInstance.on("connected", (data) => {
      console.log("[Notifications] Welcome message:", data.message);
    });

    // Listen for new notifications
    socketInstance.on("notification", (notification: Notification) => {
      console.log("[Notifications] Received:", notification);
      
      // Add to notifications list
      setNotifications((prev) => [notification, ...prev]);

      const preferences = preferencesRef.current;
      if (!shouldSurfaceNotification(notification.type, preferences)) return;

      toast.success(notification.title, {
        description: notification.message,
        duration: 5000,
      });

      // Request browser notification permission if not granted
      if (shouldUseBrowserNotification(preferences) && Notification.permission === "default") {
        Notification.requestPermission();
      }

      // Show browser notification if permitted
      if (shouldUseBrowserNotification(preferences) && Notification.permission === "granted") {
        new Notification(notification.title, {
          body: notification.message,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
        });
      }
    });

    // Listen for signal updates
    socketInstance.on("signal_update", (signal: any) => {
      console.log("[Notifications] Signal update:", signal);
      if (!shouldSurfaceNotification("signal_update", preferencesRef.current)) return;
      toast.info(`Signal Update: ${signal.symbol}`, {
        description: `Outcome: ${signal.outcome}`,
        duration: 5000,
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Update notifications from API
  useEffect(() => {
    if (notificationsData) {
      setNotifications(notificationsData as Notification[]);
    }
  }, [notificationsData]);

  const unreadCount = notifications.filter((n) => n.isRead === 0).length;

  const markAsRead = useCallback(
    async (notificationId: number) => {
      try {
        await markAsReadMutation.mutateAsync({ notificationId });
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, isRead: 1 } : n))
        );
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    },
    [markAsReadMutation]
  );

  const markAllAsRead = useCallback(async () => {
    try {
      await markAllAsReadMutation.mutateAsync();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: 1 })));
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  }, [markAllAsReadMutation]);

  const refreshNotifications = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        isConnected,
        markAsRead,
        markAllAsRead,
        refreshNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

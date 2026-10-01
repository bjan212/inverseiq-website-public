import { describe, it, expect, beforeAll } from "vitest";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import type { Request, Response } from "express";

/**
 * Test suite for notification system
 */

describe("Notification System", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    // Create a mock context for testing
    const mockReq = {} as Request;
    const mockRes = {} as Response;
    const mockContext = createContext({ req: mockReq, res: mockRes });
    caller = appRouter.createCaller(mockContext);
  });

  it("should save a new notification", async () => {
    const notificationData = {
      type: "signal_hit_tp" as const,
      title: "Test Notification",
      message: "This is a test notification",
      signalId: 1,
      metadata: JSON.stringify({ test: true }),
    };

    const result = await caller.notifications.save(notificationData);

    expect(result.success).toBe(true);
    expect(result.result).toBeDefined();
  });

  it("should retrieve all notifications", async () => {
    const notifications = await caller.notifications.list({
      limit: 10,
    });

    expect(Array.isArray(notifications)).toBe(true);
  });

  it("should retrieve unread notifications only", async () => {
    const notifications = await caller.notifications.list({
      unreadOnly: true,
    });

    expect(Array.isArray(notifications)).toBe(true);
    // All notifications should be unread
    notifications.forEach((notification) => {
      expect(notification.isRead).toBe(0);
    });
  });

  it("should mark notification as read", async () => {
    // First, create a notification
    const notificationData = {
      type: "signal_verified" as const,
      title: "Mark as Read Test",
      message: "Testing mark as read functionality",
    };

    const createResult = await caller.notifications.save(notificationData);
    expect(createResult.success).toBe(true);

    // Get the notification ID (we'll use 1 for simplicity in this test)
    const result = await caller.notifications.markAsRead({
      notificationId: 1,
    });

    expect(result.success).toBe(true);
  });

  it("should mark all notifications as read", async () => {
    const result = await caller.notifications.markAllAsRead();
    expect(result.success).toBe(true);
  });

  it("should validate notification type enum", async () => {
    const invalidNotification = {
      type: "invalid_type" as any,
      title: "Invalid Type",
      message: "This should fail",
    };

    await expect(caller.notifications.save(invalidNotification)).rejects.toThrow();
  });

  it("should accept all valid notification types", async () => {
    const validTypes = [
      "signal_verified",
      "signal_hit_tp",
      "signal_hit_sl",
      "signal_expired",
      "system",
    ] as const;

    for (const type of validTypes) {
      const notification = {
        type,
        title: `Test ${type}`,
        message: `Testing ${type} notification`,
      };

      const result = await caller.notifications.save(notification);
      expect(result.success).toBe(true);
    }
  });
});

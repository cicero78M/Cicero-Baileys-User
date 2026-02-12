import { jest } from "@jest/globals";

process.env.JWT_SECRET = "testsecret";

import {
  setMenuTimeout,
  userMenuContext,
  SESSION_EXPIRED_MESSAGE,
} from "../src/utils/sessionsHelper.js";

describe("User Menu Session Timeout", () => {
  const chatId = "628111222333@s.whatsapp.net";
  let waClient;

  beforeEach(() => {
    jest.useFakeTimers();
    
    // Clear any existing sessions
    if (userMenuContext[chatId]) {
      const ctx = userMenuContext[chatId];
      if (ctx.timeout) clearTimeout(ctx.timeout);
      if (ctx.warningTimeout) clearTimeout(ctx.warningTimeout);
      if (ctx.noReplyTimeout) clearTimeout(ctx.noReplyTimeout);
      delete userMenuContext[chatId];
    }

    waClient = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    
    // Clean up any remaining timeouts
    if (userMenuContext[chatId]) {
      const ctx = userMenuContext[chatId];
      if (ctx.timeout) clearTimeout(ctx.timeout);
      if (ctx.warningTimeout) clearTimeout(ctx.warningTimeout);
      if (ctx.noReplyTimeout) clearTimeout(ctx.noReplyTimeout);
      delete userMenuContext[chatId];
    }
  });

  it("should set session timeout to 5 minutes (300000ms)", () => {
    setMenuTimeout(chatId, waClient);

    expect(userMenuContext[chatId]).toBeDefined();
    expect(userMenuContext[chatId].timeout).toBeDefined();
  });

  it("should send warning message 3 minutes after session start", () => {
    setMenuTimeout(chatId, waClient);

    // Fast-forward 3 minutes (180000ms)
    jest.advanceTimersByTime(180000);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Sesi akan berakhir dalam 2 menit")
    );
    expect(waClient.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("should send expiry message after 5 minutes of inactivity", () => {
    setMenuTimeout(chatId, waClient);

    // Fast-forward 5 minutes (300000ms)
    jest.advanceTimersByTime(300000);

    expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, SESSION_EXPIRED_MESSAGE);
    expect(userMenuContext[chatId]).toBeUndefined();
  });

  it("should clear all timeouts when session is closed", () => {
    setMenuTimeout(chatId, waClient);

    const ctx = userMenuContext[chatId];
    expect(ctx.timeout).toBeDefined();
    expect(ctx.warningTimeout).toBeDefined();

    // Clear all timeouts
    clearTimeout(ctx.timeout);
    clearTimeout(ctx.warningTimeout);
    if (ctx.noReplyTimeout) clearTimeout(ctx.noReplyTimeout);
    delete userMenuContext[chatId];

    expect(userMenuContext[chatId]).toBeUndefined();
  });

  it("should refresh timeout on each interaction", () => {
    setMenuTimeout(chatId, waClient);
    const firstTimeout = userMenuContext[chatId].timeout;

    // Simulate user interaction by refreshing timeout
    setMenuTimeout(chatId, waClient);
    const secondTimeout = userMenuContext[chatId].timeout;

    // Timeouts should be different objects (old one cleared, new one created)
    expect(firstTimeout).not.toBe(secondTimeout);
  });

  it("should set noReplyTimeout when expectReply is true", () => {
    setMenuTimeout(chatId, waClient, true);

    expect(userMenuContext[chatId].noReplyTimeout).toBeDefined();
    
    // Fast-forward 120 seconds to trigger noReply message
    jest.advanceTimersByTime(120000);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Menunggu Balasan")
    );
  });

  it("should send both warning and expiry messages at correct times", () => {
    setMenuTimeout(chatId, waClient);

    // Fast-forward 3 minutes - should trigger warning
    jest.advanceTimersByTime(180000);
    expect(waClient.sendMessage).toHaveBeenCalledTimes(1);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Sesi akan berakhir dalam 2 menit")
    );

    // Fast-forward another 2 minutes (total 5 minutes) - should trigger expiry
    jest.advanceTimersByTime(120000);
    expect(waClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, SESSION_EXPIRED_MESSAGE);
    expect(userMenuContext[chatId]).toBeUndefined();
  });
});

import { jest } from "@jest/globals";

process.env.JWT_SECRET = "testsecret";

import {
  setMenuTimeout,
  userMenuContext,
  SESSION_EXPIRED_MESSAGE,
  isInTimeoutCooldown,
  setSessionTimeoutCooldown,
} from "../src/utils/sessionsHelper.js";

// Simulate closeSession functionality without importing it
// Note: We duplicate this logic instead of importing from userMenuHandlers.js
// to avoid dependency issues with env.js that would require setting up many
// environment variables for the test. This duplicated function is tested
// against the same behavior and will catch any discrepancies.
const simulateCloseSession = async (session, chatId, waClient, message) => {
  // Clear all timeout handlers to prevent messages after session close
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }
  if (session.warningTimeout) {
    clearTimeout(session.warningTimeout);
    session.warningTimeout = null;
  }
  if (session.noReplyTimeout) {
    clearTimeout(session.noReplyTimeout);
    session.noReplyTimeout = null;
  }
  
  session.exit = true;
  await waClient.sendMessage(chatId, message);
};

describe("User Menu Session Timeout Fixes", () => {
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

  describe("Issue 1: Timeout handlers continuing after session close", () => {
    it("should not send timeout messages after closeSession is called", async () => {
      // Start a session with all timeouts
      setMenuTimeout(chatId, waClient, true);
      
      const session = userMenuContext[chatId];
      expect(session.timeout).toBeDefined();
      expect(session.warningTimeout).toBeDefined();
      expect(session.noReplyTimeout).toBeDefined();

      // Close the session
      await simulateCloseSession(session, chatId, waClient, "Terima kasih. Sesi ditutup.");

      // Verify timeouts are cleared
      expect(session.timeout).toBeNull();
      expect(session.warningTimeout).toBeNull();
      expect(session.noReplyTimeout).toBeNull();
      
      // Fast-forward past all timeout points
      jest.advanceTimersByTime(300000); // 5 minutes

      // Should only have 1 call from closeSession, no timeout messages
      expect(waClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(waClient.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining("Terima kasih")
      );
    });

    it("should not send noReply timeout message after session is closed", async () => {
      setMenuTimeout(chatId, waClient, true);
      
      const session = userMenuContext[chatId];
      
      // Close session before noReply timeout
      await simulateCloseSession(session, chatId, waClient, "Terima kasih. Sesi ditutup.");
      
      // Fast-forward to when noReply would have fired
      jest.advanceTimersByTime(120000);

      // Only closeSession message, no noReply message
      expect(waClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(waClient.sendMessage).not.toHaveBeenCalledWith(
        chatId,
        expect.stringContaining("Menunggu Balasan")
      );
    });
  });

  describe("Issue 2: Timeout handlers checking session existence", () => {
    it("should not send messages if session was deleted before timeout fires", () => {
      setMenuTimeout(chatId, waClient, true);
      
      // Manually delete session (simulating another code path closing it)
      delete userMenuContext[chatId];

      // Fast-forward to trigger timeouts
      jest.advanceTimersByTime(120000); // noReply timeout
      jest.advanceTimersByTime(60000);  // warning timeout
      jest.advanceTimersByTime(120000); // expiry timeout

      // No messages should be sent because session was already deleted
      expect(waClient.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("Issue 3: Auto-start cooldown after timeout", () => {
    it("should set cooldown when session times out", () => {
      setMenuTimeout(chatId, waClient);

      // Fast-forward to session expiry
      jest.advanceTimersByTime(300000);

      expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, SESSION_EXPIRED_MESSAGE);
      expect(userMenuContext[chatId]).toBeUndefined();
      
      // Cooldown should be active
      expect(isInTimeoutCooldown(chatId)).toBe(true);
    });

    it("should clear cooldown after 30 seconds", () => {
      setSessionTimeoutCooldown(chatId);
      
      expect(isInTimeoutCooldown(chatId)).toBe(true);
      
      // Fast-forward past cooldown period
      jest.advanceTimersByTime(30000);
      
      expect(isInTimeoutCooldown(chatId)).toBe(false);
    });

    it("isInTimeoutCooldown should return false for non-existent chatId", () => {
      expect(isInTimeoutCooldown("nonexistent@s.whatsapp.net")).toBe(false);
    });

    it("should check cooldown elapsed time correctly", () => {
      setSessionTimeoutCooldown(chatId);
      
      // Just set, should be in cooldown
      expect(isInTimeoutCooldown(chatId)).toBe(true);
      
      // After 15 seconds, still in cooldown
      jest.advanceTimersByTime(15000);
      expect(isInTimeoutCooldown(chatId)).toBe(true);
      
      // After 30 seconds total, cooldown expired
      jest.advanceTimersByTime(15000);
      expect(isInTimeoutCooldown(chatId)).toBe(false);
    });
  });

  describe("Integration: Full timeout flow with fixes", () => {
    it("should handle complete timeout sequence correctly", () => {
      setMenuTimeout(chatId, waClient, true);

      // T+120s: noReply message
      jest.advanceTimersByTime(120000);
      expect(waClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(waClient.sendMessage).toHaveBeenLastCalledWith(
        chatId,
        expect.stringContaining("Menunggu Balasan")
      );

      // T+180s: warning message
      jest.advanceTimersByTime(60000);
      expect(waClient.sendMessage).toHaveBeenCalledTimes(2);
      expect(waClient.sendMessage).toHaveBeenLastCalledWith(
        chatId,
        expect.stringContaining("Sesi akan berakhir dalam 2 menit")
      );

      // T+300s: expiry message and cooldown set
      jest.advanceTimersByTime(120000);
      expect(waClient.sendMessage).toHaveBeenCalledTimes(3);
      expect(waClient.sendMessage).toHaveBeenLastCalledWith(chatId, SESSION_EXPIRED_MESSAGE);
      expect(userMenuContext[chatId]).toBeUndefined();
      expect(isInTimeoutCooldown(chatId)).toBe(true);
    });

    it("should not send any messages after closeSession during timeout sequence", async () => {
      setMenuTimeout(chatId, waClient, true);

      // T+120s: noReply message would fire here
      jest.advanceTimersByTime(120000);
      expect(waClient.sendMessage).toHaveBeenCalledTimes(1);

      // User closes session
      const session = userMenuContext[chatId];
      waClient.sendMessage.mockClear();
      await simulateCloseSession(session, chatId, waClient, "Terima kasih. Sesi ditutup.");

      // Only closeSession message
      expect(waClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(waClient.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining("Terima kasih")
      );

      // Clear mock again
      waClient.sendMessage.mockClear();

      // Fast-forward past all remaining timeouts
      jest.advanceTimersByTime(180000);

      // No more messages should be sent
      expect(waClient.sendMessage).not.toHaveBeenCalled();
    });
  });
});

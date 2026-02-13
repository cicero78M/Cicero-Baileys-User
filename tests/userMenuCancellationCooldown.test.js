import { jest } from "@jest/globals";

process.env.JWT_SECRET = "testsecret";

import {
  userMenuContext,
  setSessionTimeoutCooldown,
  isInTimeoutCooldown,
} from "../src/utils/sessionsHelper.js";

describe("User Menu Cancellation Cooldown", () => {
  const chatId = "628111222333@s.whatsapp.net";
  const chatId2 = "628111222444@s.whatsapp.net";

  beforeEach(() => {
    // Clear any existing sessions
    if (userMenuContext[chatId]) {
      const ctx = userMenuContext[chatId];
      if (ctx.timeout) clearTimeout(ctx.timeout);
      if (ctx.warningTimeout) clearTimeout(ctx.warningTimeout);
      if (ctx.noReplyTimeout) clearTimeout(ctx.noReplyTimeout);
      delete userMenuContext[chatId];
    }
    if (userMenuContext[chatId2]) {
      const ctx = userMenuContext[chatId2];
      if (ctx.timeout) clearTimeout(ctx.timeout);
      if (ctx.warningTimeout) clearTimeout(ctx.warningTimeout);
      if (ctx.noReplyTimeout) clearTimeout(ctx.noReplyTimeout);
      delete userMenuContext[chatId2];
    }
  });

  afterEach(() => {
    // Clean up
    if (userMenuContext[chatId]) {
      const ctx = userMenuContext[chatId];
      if (ctx.timeout) clearTimeout(ctx.timeout);
      if (ctx.warningTimeout) clearTimeout(ctx.warningTimeout);
      if (ctx.noReplyTimeout) clearTimeout(ctx.noReplyTimeout);
      delete userMenuContext[chatId];
    }
    if (userMenuContext[chatId2]) {
      const ctx = userMenuContext[chatId2];
      if (ctx.timeout) clearTimeout(ctx.timeout);
      if (ctx.warningTimeout) clearTimeout(ctx.warningTimeout);
      if (ctx.noReplyTimeout) clearTimeout(ctx.noReplyTimeout);
      delete userMenuContext[chatId2];
    }
  });

  it("should set cooldown when session is canceled with batal", () => {
    // Set cooldown
    setSessionTimeoutCooldown(chatId);

    // Verify cooldown is active
    expect(isInTimeoutCooldown(chatId)).toBe(true);
  });

  it("should prevent auto-start when cooldown is active", () => {
    // Set cooldown
    setSessionTimeoutCooldown(chatId);

    // Simulate checking before auto-starting bind session
    const shouldAutoStart = !isInTimeoutCooldown(chatId);

    expect(shouldAutoStart).toBe(false);
  });

  it("should allow auto-start when cooldown is not active for different user", () => {
    // Use a different chatId that doesn't have cooldown

    // Simulate checking before auto-starting bind session
    const shouldAutoStart = !isInTimeoutCooldown(chatId2);

    expect(shouldAutoStart).toBe(true);
  });
});

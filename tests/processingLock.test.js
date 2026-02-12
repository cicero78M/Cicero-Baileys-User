import { jest } from "@jest/globals";

let acquireProcessingLock;
let isProcessing;
let readProcessingLockTimeoutMs;

describe("processing lock safeguards", () => {
  const chatId = "628111222333@s.whatsapp.net";

  beforeAll(async () => {
    process.env.JWT_SECRET = "testsecret";
    ({
      acquireProcessingLock,
      isProcessing,
      readProcessingLockTimeoutMs,
    } = await import("../src/utils/sessionsHelper.js"));
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("should acquire and release lock normally", async () => {
    const releaseLock = await acquireProcessingLock(chatId, {
      scope: "unit-test",
      step: "normal-release",
    });

    expect(isProcessing(chatId)).toBe(true);

    releaseLock();

    expect(isProcessing(chatId)).toBe(false);
  });

  it("should auto-release lock and log diagnostics when timeout is reached", async () => {
    const timeoutMs = readProcessingLockTimeoutMs();
    await acquireProcessingLock(chatId, {
      scope: "unit-test",
      step: "timeout-release",
    });

    expect(isProcessing(chatId)).toBe(true);

    jest.advanceTimersByTime(timeoutMs);

    expect(isProcessing(chatId)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(`[acquireProcessingLock] Lock timeout for chatId: ${chatId}`)
    );
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('context={"scope":"unit-test","step":"timeout-release"}')
    );
  });
});

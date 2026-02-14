import { jest } from "@jest/globals";

process.env.JWT_SECRET = "testsecret";
import {
  SESSION_CLOSED_MESSAGE,
  userMenuHandlers,
} from "../src/handler/menu/userMenuHandlers.js";

let createUserMenuStepSnapshot;
let setUserMenuStep;
let shouldDropStaleUserMenuInput;

describe("userMenuHandlers conversational flow", () => {
  const chatId = "628111222333@c.us";
  let waClient;

  beforeAll(async () => {
    ({ createUserMenuStepSnapshot, setUserMenuStep, shouldDropStaleUserMenuInput } = await import("../src/utils/sessionsHelper.js"));
  });

  beforeEach(() => {
    waClient = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
  });

  it("mentions batal option when showing update prompt on main handler", async () => {
    const session = { identityConfirmed: true, user_id: "123" };
    const userModel = {
      findUserByWhatsApp: jest.fn().mockResolvedValue({
        user_id: "123",
        nama: "Bripka Seno",
      }),
    };

    await userMenuHandlers.main(session, chatId, "", waClient, null, userModel);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("⏹️ Balas *batal* untuk menutup sesi")
    );
  });

  it("mentions batal option when confirming identity in main handler", async () => {
    const session = { identityConfirmed: false };
    const userModel = {
      findUserByWhatsApp: jest.fn().mockResolvedValue({
        user_id: "999",
        nama: "Bripka Seno",
      }),
    };

    await userMenuHandlers.main(session, chatId, "", waClient, null, userModel);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("⏹️ Balas *batal* untuk menutup sesi")
    );
  });

  it("informs unregistered users why NRP is needed and how to exit", async () => {
    const session = {};
    const userModel = {
      findUserByWhatsApp: jest.fn().mockResolvedValue(null),
    };

    await userMenuHandlers.main(session, chatId, "", waClient, null, userModel);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("📝 Silakan ketik *NRP/NIP* Anda (hanya angka):")
    );
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("⏹️ Ketik *batal* untuk keluar.")
    );
  });

  it("handles batal in confirmUserByWaIdentity", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaIdentity(
      session,
      chatId,
      "batal",
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      SESSION_CLOSED_MESSAGE
    );
  });

  it("reminds available answers when confirmUserByWaIdentity receives unknown input", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaIdentity(
      session,
      chatId,
      "mungkin",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Menu aktif saat ini: *Konfirmasi identitas data pengguna*")
    );
  });

  it.each(["iya", "ok"])('accepts synonym %s as affirmative in confirmUserByWaIdentity', async (input) => {
    const session = {};

    await userMenuHandlers.confirmUserByWaIdentity(
      session,
      chatId,
      input,
      waClient,
      null,
      null
    );

    expect(session.step).toBe("tanyaUpdateMyData");
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Identitas berhasil dikonfirmasi")
    );
  });

  it.each(["ga", "gak", "tidak"])('accepts synonym %s as negative in confirmUserByWaIdentity', async (input) => {
    const session = {};

    await userMenuHandlers.confirmUserByWaIdentity(
      session,
      chatId,
      input,
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, SESSION_CLOSED_MESSAGE);
  });

  it("handles batal in confirmUserByWaUpdate", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaUpdate(
      session,
      chatId,
      "batal",
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      SESSION_CLOSED_MESSAGE
    );
  });

  it("reminds available answers when confirmUserByWaUpdate receives unknown input", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaUpdate(
      session,
      chatId,
      "mungkin",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Menu aktif saat ini: *Konfirmasi lanjut ke menu update field*")
    );
  });

  it.each(["iya", "ok"])('accepts synonym %s as affirmative in confirmUserByWaUpdate', async (input) => {
    const session = { user_id: "123", isDitbinmas: false };

    await userMenuHandlers.confirmUserByWaUpdate(
      session,
      chatId,
      input,
      waClient,
      null,
      null
    );

    expect(session.step).toBe("updateAskField");
    expect(session.updateUserId).toBe("123");
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Pilih Field yang Ingin Diupdate")
    );
  });

  it.each(["ga", "gak", "tidak"])('accepts synonym %s as negative in confirmUserByWaUpdate', async (input) => {
    const session = {};

    await userMenuHandlers.confirmUserByWaUpdate(
      session,
      chatId,
      input,
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, SESSION_CLOSED_MESSAGE);
  });

  it("keeps session active after inputUserId receives unknown NRP", async () => {
    const session = { step: "inputUserId" };
    const userModel = {
      findUserRegistrationProfileById: jest.fn().mockResolvedValue(null),
    };

    await userMenuHandlers.inputUserId(
      session,
      chatId,
      "123456",
      waClient,
      null,
      userModel
    );

    expect(session.exit).toBeUndefined();
    expect(session.step).toBe("inputUserId");
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("❌ NRP/NIP *123456* tidak ditemukan")
    );
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Silakan masukkan NRP/NIP lain atau ketik *batal* untuk keluar")
    );
  });

  it("accepts 18-digit NRP/NIP input when binding account", async () => {
    const session = { step: "inputUserId" };
    const userModel = {
      findUserRegistrationProfileById: jest.fn().mockResolvedValue({
        user_id: "123456789012345678",
        nama: "Bripka Seno",
      }),
    };

    await userMenuHandlers.inputUserId(
      session,
      chatId,
      "123456789012345678",
      waClient,
      null,
      userModel
    );

    expect(session.step).toBe("confirmBindUser");
    expect(session.bindUserId).toBe("123456789012345678");
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("NRP/NIP *123456789012345678* ditemukan.")
    );
  });

  it("rejects NRP/NIP input outside length range", async () => {
    const session = { step: "inputUserId" };
    const userModel = {
      findUserRegistrationProfileById: jest.fn(),
    };

    await userMenuHandlers.inputUserId(
      session,
      chatId,
      "12345",
      waClient,
      null,
      userModel
    );

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("NRP/NIP harus terdiri dari 6-18 digit")
    );
  });

  it("handles batal in tanyaUpdateMyData", async () => {
    const session = {};

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      "batal",
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      SESSION_CLOSED_MESSAGE
    );
  });

  it("reminds available answers when tanyaUpdateMyData receives unknown input", async () => {
    const session = {};

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      "mungkin",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("🧭 Menu aktif saat ini: *Konfirmasi lanjut update data*")
    );
  });



  it.each(["iya", "y", "ok", "oke"])("accepts synonym %s as affirmative in tanyaUpdateMyData", async (input) => {
    const session = { user_id: "123" };

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      input,
      waClient,
      null,
      null
    );

    expect(session.step).toBe("updateAskField");
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Pilih Field yang Ingin Diupdate")
    );
  });

  it.each(["ga", "gak", "n"])("accepts synonym %s as negative in tanyaUpdateMyData", async (input) => {
    const session = {};

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      input,
      waClient,
      null,
      null
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(chatId, SESSION_CLOSED_MESSAGE);
  });

  it("debounces repeated invalid input in tanyaUpdateMyData and sends brief feedback once", async () => {
    const session = {};

    await userMenuHandlers.tanyaUpdateMyData(session, chatId, "mungkin", waClient, null, null);
    await userMenuHandlers.tanyaUpdateMyData(session, chatId, "mungkin", waClient, null, null);
    await userMenuHandlers.tanyaUpdateMyData(session, chatId, "mungkin", waClient, null, null);

    expect(waClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(waClient.sendMessage).toHaveBeenNthCalledWith(
      1,
      chatId,
      expect.stringContaining("Menu aktif saat ini")
    );
    expect(waClient.sendMessage).toHaveBeenNthCalledWith(
      2,
      chatId,
      expect.stringContaining("Input sama terdeteksi")
    );
  });

  it("sends brief repeated-input feedback for updateAskField without affecting valid path", async () => {
    const session = { isDitbinmas: false };

    await userMenuHandlers.updateAskField(session, chatId, "abc", waClient, null, null);
    await userMenuHandlers.updateAskField(session, chatId, "abc", waClient, null, null);

    expect(waClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(waClient.sendMessage).toHaveBeenNthCalledWith(
      1,
      chatId,
      expect.stringContaining("Menu aktif saat ini")
    );
    expect(waClient.sendMessage).toHaveBeenNthCalledWith(
      2,
      chatId,
      expect.stringContaining("Input sama terdeteksi")
    );
  });


  it("accepts numeric option embedded in text for updateAskField", async () => {
    const session = { isDitbinmas: false, updateUserId: "123" };
    const userModel = {
      findUserById: jest.fn().mockResolvedValue({
        user_id: "123",
        tiktok: "03031578",
      }),
    };

    await userMenuHandlers.updateAskField(
      session,
      chatId,
      "angka 6",
      waClient,
      null,
      userModel
    );

    expect(session.updateField).toBe("tiktok");
    expect(session.step).toBe("updateAskValue");
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*Update TikTok*")
    );
  });

  it("shows active menu hint for invalid option in updateAskField", async () => {
    const session = { isDitbinmas: false };

    await userMenuHandlers.updateAskField(session, chatId, "abc", waClient, null, null);

    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("🧭 Menu aktif saat ini: *Pilih field yang ingin diupdate*")
    );
  });

  it("stays silent when inputUserId receives empty message", async () => {
    const session = { step: "inputUserId" };
    const userModel = {
      findUserById: jest.fn(),
    };

    await userMenuHandlers.inputUserId(
      session,
      chatId,
      "",
      waClient,
      null,
      userModel
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when inputUserId receives whitespace only", async () => {
    const session = { step: "inputUserId" };
    const userModel = {
      findUserById: jest.fn(),
    };

    await userMenuHandlers.inputUserId(
      session,
      chatId,
      "   ",
      waClient,
      null,
      userModel
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when confirmBindUser receives empty message", async () => {
    const session = { step: "confirmBindUser", bindUserId: "123456" };

    await userMenuHandlers.confirmBindUser(
      session,
      chatId,
      "",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when confirmUserByWaIdentity receives empty message", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaIdentity(
      session,
      chatId,
      "",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when tanyaUpdateMyData receives empty message", async () => {
    const session = {};

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      "",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when confirmUserByWaUpdate receives empty message", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaUpdate(
      session,
      chatId,
      "",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when confirmBindUpdate receives empty message", async () => {
    const session = {};

    await userMenuHandlers.confirmBindUpdate(
      session,
      chatId,
      "",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when updateAskField receives empty message", async () => {
    const session = { isDitbinmas: false };

    await userMenuHandlers.updateAskField(
      session,
      chatId,
      "",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when updateAskValue receives empty message", async () => {
    const session = { updateUserId: "123", updateField: "nama" };

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      "",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when tanyaUpdateMyData receives whitespace-only message", async () => {
    const session = {};

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      "   ",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("stays silent when confirmUserByWaUpdate receives whitespace-only message", async () => {
    const session = {};

    await userMenuHandlers.confirmUserByWaUpdate(
      session,
      chatId,
      " \t ",
      waClient,
      null,
      null
    );

    expect(waClient.sendMessage).not.toHaveBeenCalled();
    expect(session.exit).toBeUndefined();
  });

  it("increments stepVersion monotonically when flow moves across steps", async () => {
    const session = {};
    const userModel = {
      findUserByWhatsApp: jest.fn().mockResolvedValue({
        user_id: "123",
        nama: "Bripka Seno",
      }),
    };

    await userMenuHandlers.main(session, chatId, "", waClient, null, userModel);
    expect(session.step).toBe("tanyaUpdateMyData");
    expect(session.stepVersion).toBe(1);

    await userMenuHandlers.tanyaUpdateMyData(
      session,
      chatId,
      "ya",
      waClient,
      null,
      { ...userModel }
    );
    expect(session.step).toBe("updateAskField");
    expect(session.stepVersion).toBe(2);
  });

  it("drops stale burst input when stepVersion changed, except for global command", () => {
    const session = { step: "inputUserId", stepVersion: 1 };
    const firstSnapshot = createUserMenuStepSnapshot(session);

    // Simulasi message lain memindahkan step lebih dulu
    setUserMenuStep(session, "confirmBindUser");

    expect(
      shouldDropStaleUserMenuInput({
        snapshot: firstSnapshot,
        session,
        text: "12345678",
      })
    ).toBe(true);

    expect(
      shouldDropStaleUserMenuInput({
        snapshot: firstSnapshot,
        session,
        text: "batal",
      })
    ).toBe(false);
  });

});

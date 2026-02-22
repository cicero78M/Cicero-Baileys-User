import { jest } from "@jest/globals";

process.env.JWT_SECRET = "testsecret";
import { userMenuHandlers } from "../src/handler/menu/userMenuHandlers.js";
import { formatFieldUpdatePrompt } from "../src/handler/menu/userMenuHelpers.js";

describe("userMenuHandlers.updateAskValue social media normalization", () => {
  const chatId = "628111222333@c.us";
  let waClient;
  let userModel;
  const pool = null;

  beforeEach(() => {
    waClient = { sendMessage: jest.fn().mockResolvedValue() };
    userModel = {
      updateUserField: jest.fn().mockResolvedValue(),
      findUserByInsta: jest.fn().mockResolvedValue(null),
      findUserByInsta2: jest.fn().mockResolvedValue(null),
      findUserByTiktok: jest.fn().mockResolvedValue(null),
      findUserByTiktok2: jest.fn().mockResolvedValue(null),
    };
    jest.spyOn(userMenuHandlers, "main").mockResolvedValue();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const buildSession = (field) => ({
    updateUserId: "12345",
    updateField: field,
  });

  test.each([
    ["https://www.instagram.com/User.Name"],
    ["@User.Name"],
    ["User.Name"],
  ])("normalizes Instagram input %s to lowercase username", async (input) => {
    const session = buildSession("insta");

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      input,
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByInsta).toHaveBeenCalledWith("user.name");
    expect(userModel.updateUserField).toHaveBeenCalledWith(
      "12345",
      "insta",
      "user.name"
    );
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*@user.name*.")
    );
  });

  test.each([
    ["https://www.tiktok.com/@Another.User"],
    ["@Another.User"],
    ["Another.User"],
  ])("normalizes TikTok input %s to lowercase username", async (input) => {
    const session = buildSession("tiktok");

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      input,
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByTiktok).toHaveBeenCalledWith("another.user");
    expect(userModel.updateUserField).toHaveBeenCalledWith(
      "12345",
      "tiktok",
      "another.user"
    );
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*@another.user*.")
    );
  });

  test.each([
    ["https://www.instagram.com/Second.User"],
    ["@Second.User"],
  ])("normalizes Instagram kedua input %s to lowercase username", async (input) => {
    const session = buildSession("insta_2");

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      input,
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByInsta).toHaveBeenCalledWith("second.user");
    expect(userModel.findUserByInsta2).toHaveBeenCalledWith("second.user");
    expect(userModel.updateUserField).toHaveBeenCalledWith(
      "12345",
      "insta_2",
      "second.user"
    );
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*Instagram Kedua* untuk NRP/NIP *12345* berhasil diupdate menjadi *@second.user*.")
    );
  });

  it("rejects Instagram kedua update when username already used in primary account by different user", async () => {
    const session = buildSession("insta_2");
    userModel.findUserByInsta.mockResolvedValue({ user_id: "99999" });

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      "@duplicate.user",
      waClient,
      pool,
      userModel
    );

    expect(userModel.updateUserField).not.toHaveBeenCalled();
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("❌ Instagram *@duplicate.user* sudah terdaftar pada pengguna lain.")
    );
  });

  it("rejects TikTok kedua update when username already used in secondary account by different user", async () => {
    const session = buildSession("tiktok_2");
    userModel.findUserByTiktok2.mockResolvedValue({ user_id: "99999" });

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      "@duplicate.user",
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByTiktok).toHaveBeenCalledWith("duplicate.user");
    expect(userModel.findUserByTiktok2).toHaveBeenCalledWith("duplicate.user");
    expect(userModel.updateUserField).not.toHaveBeenCalled();
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("❌ TikTok *@duplicate.user* sudah terdaftar pada pengguna lain.")
    );
  });

  it("rejects TikTok update when username already used by different user", async () => {
    const session = buildSession("tiktok");
    userModel.findUserByTiktok.mockResolvedValue({ user_id: "99999" });

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      "https://www.tiktok.com/@duplicate.user",
      waClient,
      pool,
      userModel
    );

    expect(userModel.findUserByTiktok).toHaveBeenCalledWith("duplicate.user");
    expect(userModel.updateUserField).not.toHaveBeenCalled();
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("❌ TikTok *@duplicate.user* sudah terdaftar pada pengguna lain.")
    );
  });

  it("stores last processed payload and keeps success value aligned for sequential inputs", async () => {
    const session = buildSession("insta");
    userModel.findUserByInsta
      .mockResolvedValueOnce({ user_id: "99999" })
      .mockResolvedValueOnce(null);

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      "@duplicate.user",
      waClient,
      pool,
      userModel
    );

    expect(userModel.updateUserField).not.toHaveBeenCalled();
    expect(waClient.sendMessage).toHaveBeenLastCalledWith(
      chatId,
      expect.stringContaining("❌ Instagram *@duplicate.user* sudah terdaftar")
    );

    await userMenuHandlers.updateAskValue(
      session,
      chatId,
      "@final.valid",
      waClient,
      pool,
      userModel
    );

    expect(userModel.updateUserField).toHaveBeenCalledWith(
      "12345",
      "insta",
      "final.valid"
    );
    expect(session.lastProcessedInput).toEqual({
      field: "insta",
      value: "final.valid",
      rawInput: "@final.valid",
    });
    expect(session.lastProcessedAt).toEqual(expect.any(String));
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("*Instagram Utama* untuk NRP/NIP *12345* berhasil diupdate menjadi *@final.valid*.")
    );
  });
});


describe("userMenuHandlers.updateAskValue field navigation", () => {
  const chatId = "628111222333@c.us";
  let waClient;

  beforeEach(() => {
    waClient = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it.each(["menu", "kembali", "back"])(
    "returns to field menu when user sends %s while updating value",
    async (input) => {
      const session = {
        updateUserId: "12345",
        updateField: "pangkat",
        isDitbinmas: true,
        availableTitles: ["AKP", "IPDA"],
        availableSatfung: ["BINMAS"],
        updateAskFieldRetry: 2,
      };
      const userModel = {
        updateUserField: jest.fn().mockResolvedValue(),
      };

      await userMenuHandlers.updateAskValue(
        session,
        chatId,
        input,
        waClient,
        null,
        userModel
      );

      expect(session.step).toBe("updateAskField");
      expect(session.updateField).toBeUndefined();
      expect(session.availableTitles).toBeUndefined();
      expect(session.availableSatfung).toBeUndefined();
      expect(session.updateAskFieldRetry).toBe(0);
      expect(userModel.updateUserField).not.toHaveBeenCalled();
      expect(waClient.sendMessage).toHaveBeenCalledWith(
        chatId,
        expect.stringContaining("Pilih Field yang Ingin Diupdate")
      );
    }
  );
});


describe("userMenuHandlers intent parser integration", () => {
  const chatId = "628111222333@c.us";
  let waClient;

  beforeEach(() => {
    waClient = { sendMessage: jest.fn().mockResolvedValue() };
  });

  it.each(["iya", "ok", "oke"])('accepts synonym %s as affirmative in confirmBindUpdate', async (input) => {
    const session = { updateUserId: "12345", isDitbinmas: false };
    const userModel = {
      updateUserField: jest.fn().mockResolvedValue(),
    };

    await userMenuHandlers.confirmBindUpdate(
      session,
      chatId,
      input,
      waClient,
      null,
      userModel
    );

    expect(userModel.updateUserField).toHaveBeenCalledWith("12345", "whatsapp", "628111222333");
    expect(session.step).toBe("updateAskField");
  });

  it.each(["ga", "gak", "tidak"])('accepts synonym %s as negative in confirmBindUpdate', async (input) => {
    const session = { updateUserId: "12345" };

    await userMenuHandlers.confirmBindUpdate(
      session,
      chatId,
      input,
      waClient,
      null,
      {}
    );

    expect(session.exit).toBe(true);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Proses dibatalkan")
    );
  });

  it("debounces repeated invalid input in confirmBindUpdate", async () => {
    const session = { updateUserId: "12345" };

    await userMenuHandlers.confirmBindUpdate(session, chatId, "mungkin", waClient, null, {});
    await userMenuHandlers.confirmBindUpdate(session, chatId, "mungkin", waClient, null, {});

    expect(waClient.sendMessage).toHaveBeenCalledTimes(1);
    expect(waClient.sendMessage).toHaveBeenCalledWith(
      chatId,
      expect.stringContaining("Menu aktif saat ini: *Konfirmasi update nomor WhatsApp*")
    );
  });
});


describe("formatFieldUpdatePrompt", () => {
  it("shows explicit menu instruction to return to field list", () => {
    const prompt = formatFieldUpdatePrompt("nama", "Nama", "BUDI");

    expect(prompt).toContain("Ketik *menu* untuk kembali ke daftar field");
  });
});

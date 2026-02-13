import { jest } from "@jest/globals";

process.env.JWT_SECRET = "testsecret";
import { normalizeWhatsappNumber } from "../src/utils/waHelper.js";
import { userMenuHandlers } from "../src/handler/menu/userMenuHandlers.js";

describe("WhatsApp Linking Fix - Old Format Compatibility", () => {
  let waClient;
  let userModel;

  beforeEach(() => {
    waClient = {
      sendMessage: jest.fn().mockResolvedValue(),
    };
    userModel = {
      findUserRegistrationProfileById: jest.fn(),
    };
  });

  describe("inputUserId handler - stored number comparison", () => {
    it("should allow re-linking when stored number is in old @c.us format", async () => {
      const session = { step: "inputUserId" };
      const currentChatId = "6282132963115@s.whatsapp.net"; // New Baileys format
      const nrpInput = "98050515";
      
      // Simulate old database record with @c.us format
      userModel.findUserRegistrationProfileById.mockResolvedValue({
        user_id: "98050515",
        nama: "Test User",
        whatsapp: "6282132963115@c.us", // OLD FORMAT stored in DB
        status: true
      });

      await userMenuHandlers.inputUserId(
        session, 
        currentChatId, 
        nrpInput, 
        waClient, 
        null, 
        userModel
      );

      // Should normalize both numbers and see they match
      // Therefore should proceed to confirmBindUser step
      expect(session.step).toBe("confirmBindUser");
      expect(session.bindUserId).toBe(nrpInput);
      
      // Should send confirmation message, not error message
      expect(waClient.sendMessage).toHaveBeenCalledWith(
        currentChatId,
        expect.stringContaining("✅ NRP/NIP *98050515* ditemukan")
      );
      
      // Should NOT send "already linked" error message
      expect(waClient.sendMessage).not.toHaveBeenCalledWith(
        currentChatId,
        expect.stringContaining("sudah terhubung dengan nomor WhatsApp lain")
      );
    });

    it("should allow re-linking when stored number is plain digits", async () => {
      const session = { step: "inputUserId" };
      const currentChatId = "6282132963115@s.whatsapp.net"; // New Baileys format
      const nrpInput = "98050515";
      
      // Simulate database record with plain digits (already normalized)
      userModel.findUserRegistrationProfileById.mockResolvedValue({
        user_id: "98050515",
        nama: "Test User",
        whatsapp: "6282132963115", // Plain digits
        status: true
      });

      await userMenuHandlers.inputUserId(
        session, 
        currentChatId, 
        nrpInput, 
        waClient, 
        null, 
        userModel
      );

      // Should match and proceed
      expect(session.step).toBe("confirmBindUser");
      expect(waClient.sendMessage).toHaveBeenCalledWith(
        currentChatId,
        expect.stringContaining("✅ NRP/NIP *98050515* ditemukan")
      );
    });

    it("should block when stored number is actually different", async () => {
      const session = { step: "inputUserId" };
      const currentChatId = "6281234567890@s.whatsapp.net"; // Different number
      const nrpInput = "98050515";
      
      // Database has different number linked
      userModel.findUserRegistrationProfileById.mockResolvedValue({
        user_id: "98050515",
        nama: "Test User",
        whatsapp: "6289876543210@c.us", // Different number
        status: true
      });

      await userMenuHandlers.inputUserId(
        session, 
        currentChatId, 
        nrpInput, 
        waClient, 
        null, 
        userModel
      );

      // Should NOT proceed to confirmBindUser
      expect(session.step).toBe("inputUserId");
      
      // Should send error message
      expect(waClient.sendMessage).toHaveBeenCalledWith(
        currentChatId,
        expect.stringContaining("sudah terhubung dengan nomor WhatsApp lain")
      );
    });

    it("should allow linking when no WhatsApp number is stored", async () => {
      const session = { step: "inputUserId" };
      const currentChatId = "6282132963115@s.whatsapp.net";
      const nrpInput = "98050515";
      
      // Database has no WhatsApp linked
      userModel.findUserRegistrationProfileById.mockResolvedValue({
        user_id: "98050515",
        nama: "Test User",
        whatsapp: "", // Empty
        status: true
      });

      await userMenuHandlers.inputUserId(
        session, 
        currentChatId, 
        nrpInput, 
        waClient, 
        null, 
        userModel
      );

      // Should proceed to confirmBindUser
      expect(session.step).toBe("confirmBindUser");
      expect(waClient.sendMessage).toHaveBeenCalledWith(
        currentChatId,
        expect.stringContaining("✅ NRP/NIP *98050515* ditemukan")
      );
    });
  });

  describe("Normalization consistency", () => {
    it("old and new formats normalize to same value", () => {
      const oldFormat = "6282132963115@c.us";
      const newFormat = "6282132963115@s.whatsapp.net";
      const plainDigits = "6282132963115";

      const normalizedOld = normalizeWhatsappNumber(oldFormat);
      const normalizedNew = normalizeWhatsappNumber(newFormat);
      const normalizedPlain = normalizeWhatsappNumber(plainDigits);

      expect(normalizedOld).toBe("6282132963115");
      expect(normalizedNew).toBe("6282132963115");
      expect(normalizedPlain).toBe("6282132963115");
      expect(normalizedOld).toBe(normalizedNew);
      expect(normalizedNew).toBe(normalizedPlain);
    });
  });
});

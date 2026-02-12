import {
  shouldAutoStartUserMenu,
  shouldSendLightHelpForUnknownMessage,
} from "../src/utils/waUserMenuPolicy.js";

describe("WA user menu policy", () => {
  test("does not auto-start for non-command text when auto-start is enabled", () => {
    const shouldStart = shouldAutoStartUserMenu({
      allowUserMenu: true,
      hasUserMenuSession: false,
      lowerText: "halo admin",
      autoStartEnabled: true,
    });

    expect(shouldStart).toBe(false);
  });

  test("auto-starts only for whitelisted command when enabled", () => {
    const shouldStart = shouldAutoStartUserMenu({
      allowUserMenu: true,
      hasUserMenuSession: false,
      lowerText: "userrequest",
      autoStartEnabled: true,
    });

    expect(shouldStart).toBe(true);
  });

  test("returns lightweight help policy for unknown non-command", () => {
    const shouldHelp = shouldSendLightHelpForUnknownMessage({
      allowUserMenu: true,
      lowerText: "halo admin",
      isAdminCommand: false,
    });

    expect(shouldHelp).toBe(true);
  });

  test("does not return lightweight help for request commands", () => {
    const shouldHelp = shouldSendLightHelpForUnknownMessage({
      allowUserMenu: true,
      lowerText: "clientrequest",
      isAdminCommand: false,
    });

    expect(shouldHelp).toBe(false);
  });
});

const defaultUserMenuCommandWhitelist = new Set(["userrequest"]);

export function shouldAutoStartUserMenu({
  allowUserMenu,
  hasUserMenuSession,
  lowerText,
  autoStartEnabled,
  commandWhitelist = defaultUserMenuCommandWhitelist,
}) {
  if (!allowUserMenu || hasUserMenuSession || !autoStartEnabled) {
    return false;
  }

  if (!lowerText) {
    return false;
  }

  return commandWhitelist.has(lowerText);
}

export function shouldSendLightHelpForUnknownMessage({
  allowUserMenu,
  lowerText,
  isAdminCommand,
}) {
  if (!allowUserMenu || !lowerText || isAdminCommand) {
    return false;
  }

  return !lowerText.endsWith("request");
}

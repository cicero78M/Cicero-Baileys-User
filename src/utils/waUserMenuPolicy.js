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
  // Never send "command not recognized" message anymore
  // Instead, let the main flow check if user is linked and start linking workflow if needed
  return false;
}

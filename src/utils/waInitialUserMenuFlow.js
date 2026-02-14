import { validateNRP } from "../handler/menu/userMenuValidation.js";

export function resolveInitialUserMenuFlow({
  allowUserMenu,
  isAdminCommand,
  lowerText,
  originalText,
  hasAnySession,
  isInTimeoutCooldown,
  isLinked,
}) {
  if (!allowUserMenu || isAdminCommand || !lowerText) {
    return { shouldEvaluate: false, shouldAutoStart: false, useDirectNrpInput: false };
  }

  if (hasAnySession || isInTimeoutCooldown) {
    return { shouldEvaluate: false, shouldAutoStart: false, useDirectNrpInput: false };
  }

  if (isLinked) {
    return { shouldEvaluate: true, shouldAutoStart: false, useDirectNrpInput: false };
  }

  const nrpValidation = validateNRP(originalText);
  if (nrpValidation.valid) {
    return {
      shouldEvaluate: true,
      shouldAutoStart: true,
      useDirectNrpInput: true,
      normalizedNrp: nrpValidation.digits,
    };
  }

  return {
    shouldEvaluate: true,
    shouldAutoStart: true,
    useDirectNrpInput: false,
  };
}

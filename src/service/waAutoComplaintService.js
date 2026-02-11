import { clientRequestHandlers } from '../handler/menu/clientRequestHandlers.js';
import { parseComplaintMessage } from './complaintService.js';
import { normalizeUserId } from '../utils/utilsHelper.js';

function normalizeWhatsAppId(value) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  if (/@[cs]\.us$/.test(trimmed) || trimmed.endsWith('@g.us')) {
    return trimmed;
  }
  const numeric = trimmed.replace(/\D/g, '');
  if (!numeric) return '';
  return `${numeric}@c.us`;
}

function hasComplaintHeader(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return false;
  const headerIndex = lines.findIndex((line) =>
    /^pesan\s+komplain/i.test(line)
  );
  if (headerIndex < 0) {
    return false;
  }
  const hasKendalaSection = lines
    .slice(headerIndex + 1)
    .some((line) =>
      /^kendala\b/.test(line.toLowerCase().replace(/[:：]/g, ''))
    );
  if (!hasKendalaSection) {
    return false;
  }
  const parsed = parseComplaintMessage(text);
  const nrp = normalizeUserId(parsed?.nrp || '');
  return Boolean(nrp);
}

export function shouldHandleComplaintMessage({
  text,
  allowUserMenu,
  session,
}) {
  if (allowUserMenu) return false;
  if (session?.menu === 'clientrequest') return false;
  return hasComplaintHeader(text);
}

export async function handleComplaintMessageIfApplicable({
  text,
  allowUserMenu,
  session,
  isAdmin,
  initialIsMyContact,
  senderId,
  chatId,
  adminOptionSessions,
  setSession,
  getSession,
  waClient,
  pool,
  userModel,
}) {
  if (
    !shouldHandleComplaintMessage({
      text,
      allowUserMenu,
      session,
    })
  ) {
    return false;
  }

  const adminSession = adminOptionSessions?.[chatId];
  if (adminSession?.timeout) {
    clearTimeout(adminSession.timeout);
  }
  if (adminOptionSessions) {
    delete adminOptionSessions[chatId];
  }

  setSession(chatId, {
    menu: 'clientrequest',
    step: 'respondComplaint_message',
    respondComplaint: {},
  });
  const updatedSession = getSession(chatId);
  await clientRequestHandlers.respondComplaint_message(
    updatedSession,
    chatId,
    text,
    waClient,
    pool,
    userModel
  );
  return true;
}

// utils/sessionsHelper.js

import { env } from "../config/env.js";

// =======================
// KONSTANTA & GLOBAL SESSIONS
// =======================

const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 menit
const USER_MENU_TIMEOUT = 5 * 60 * 1000; // 5 menit (ditingkatkan dari 3 menit)
const MENU_WARNING = 2 * 60 * 1000; // 2 menit sebelum berakhir (ditingkatkan dari 1 menit)
const MENU_TIMEOUT = 2 * 60 * 1000; // 2 menit
const BIND_TIMEOUT = 2 * 60 * 1000; // 2 menit
const NO_REPLY_TIMEOUT = 120 * 1000; // 120 detik (ditingkatkan dari 90 detik)
const USER_REQUEST_LINK_TIMEOUT = 2 * 60 * 1000; // 2 menit
const AUTO_START_COOLDOWN = 30 * 1000; // 30 detik cooldown setelah timeout
const DEFAULT_PROCESSING_LOCK_TIMEOUT_MS = 30 * 1000;

const getProcessingLockTimeoutMs = () => {
  const rawTimeoutMs = env.WA_PROCESSING_LOCK_TIMEOUT_MS;
  if (Number.isFinite(rawTimeoutMs) && rawTimeoutMs >= 5000) {
    return rawTimeoutMs;
  }
  return DEFAULT_PROCESSING_LOCK_TIMEOUT_MS;
};

export const SESSION_EXPIRED_MESSAGE =
  "⏰ *Sesi Telah Berakhir*\n\nSesi Anda telah berakhir karena tidak ada aktivitas selama 5 menit.\n\n📝 *Tips:* Siapkan informasi yang diperlukan sebelum memulai sesi untuk menghindari timeout.\n\nUntuk memulai lagi, ketik *userrequest*.";

export const userMenuContext = {};         // { chatId: {step, ...} }
export const updateUsernameSession = {};   // { chatId: {step, ...} }
export const userRequestLinkSessions = {}; // { chatId: { ... } }
export const knownUserSet = new Set();     // Set of WA number or chatId (untuk first time/fallback)
export const waBindSessions = {};          // { chatId: {step, ...} }
export const operatorOptionSessions = {};  // { chatId: {timeout} }
export const adminOptionSessions = {};     // { chatId: {timeout} }
const clientRequestSessions = {};          // { chatId: {step, data, ...} }

// Track when sessions timeout to prevent immediate auto-start
const sessionTimeoutCooldowns = {};        // { chatId: timestamp }

// =======================
// MESSAGE PROCESSING LOCKS
// =======================

const processingLocks = {};  // { chatId: Promise }
const lockQueues = {};       // { chatId: Array<Function> }
const lockMetadata = {};     // { chatId: { acquiredAt, waitTimeMs, queueDepthOnAcquire, context } }

/**
 * Acquire a processing lock for a chatId to prevent concurrent message handling
 * Uses a queue-based approach to prevent race conditions
 * @param {string} chatId
 * @param {object} [context={}] Additional context for diagnostics (e.g. currentStep)
 * @returns {Promise<Function>} Release function to call when done
 */
export async function acquireProcessingLock(chatId, context = {}) {
  const queuedAt = Date.now();

  // Create queue if it doesn't exist
  if (!lockQueues[chatId]) {
    lockQueues[chatId] = [];
  }
  
  // If there's an active lock, queue this request
  if (processingLocks[chatId]) {
    await new Promise(resolve => {
      lockQueues[chatId].push(resolve);
    });
  }
  
  // Create a new lock with timeout safety
  let releaseLock;
  let timeoutId;
  let lockReleased = false;  // Flag to prevent double-release
  const processingLockTimeoutMs = getProcessingLockTimeoutMs();
  const acquiredAt = Date.now();

  lockMetadata[chatId] = {
    acquiredAt,
    waitTimeMs: acquiredAt - queuedAt,
    queueDepthOnAcquire: lockQueues[chatId]?.length || 0,
    context,
  };
  
  processingLocks[chatId] = new Promise(resolve => {
    releaseLock = () => {
      if (lockReleased) return;  // Prevent double-release
      lockReleased = true;
      
      clearTimeout(timeoutId);
      delete processingLocks[chatId];
      delete lockMetadata[chatId];
      resolve();
      
      // Process next in queue after resolving current lock
      const nextInQueue = lockQueues[chatId]?.shift();
      if (nextInQueue) {
        nextInQueue();
      } else {
        delete lockQueues[chatId];
      }
    };
  });
  
  // Safety timeout: auto-release after configured timeout to prevent permanent deadlock
  timeoutId = setTimeout(() => {
    const metadata = lockMetadata[chatId];

    // Only force release if lock still exists and not already released
    if (processingLocks[chatId] && !lockReleased) {
      const heldForMs = metadata?.acquiredAt ? Date.now() - metadata.acquiredAt : null;
      const waitTimeMs = metadata?.waitTimeMs ?? null;
      const queueDepthOnAcquire = metadata?.queueDepthOnAcquire ?? null;
      const currentQueueDepth = lockQueues[chatId]?.length || 0;
      const contextInfo = metadata?.context ? JSON.stringify(metadata.context) : "{}";
      console.warn(
        `[acquireProcessingLock] Lock timeout for chatId: ${chatId}, forcing release | timeoutMs=${processingLockTimeoutMs} heldForMs=${heldForMs} waitTimeMs=${waitTimeMs} queueDepthOnAcquire=${queueDepthOnAcquire} currentQueueDepth=${currentQueueDepth} context=${contextInfo}`
      );
      releaseLock();
    }
  }, processingLockTimeoutMs);
  
  return releaseLock;
}

/**
 * Check if a chatId is currently being processed
 * @param {string} chatId
 * @returns {boolean}
 */
export function isProcessing(chatId) {
  return !!processingLocks[chatId];
}

/**
 * Read current lock timeout used by acquireProcessingLock.
 * Exposed for diagnostics/tests.
 * @returns {number}
 */
export function readProcessingLockTimeoutMs() {
  return getProcessingLockTimeoutMs();
}

// =======================
// UTILITY UNTUK MENU USER (INTERAKTIF)
// =======================

/**
 * Set timeout auto-expire pada userMenuContext (menu interaktif user).
 * Sekaligus mengatur timeout balasan jika diperlukan.
 * @param {string} chatId
 * @param {object} waClient - client untuk mengirim pesan WA
 * @param {boolean} [expectReply=false] - apakah menunggu balasan user
 */
export function setMenuTimeout(chatId, waClient, expectReply = false) {
  if (!userMenuContext[chatId]) {
    userMenuContext[chatId] = {};
  }
  const ctx = userMenuContext[chatId];
  if (!Number.isFinite(ctx.activitySeq)) {
    ctx.activitySeq = 0;
  }
  ctx.lastActivityAt = Date.now();
  if (ctx.timeout) {
    clearTimeout(ctx.timeout);
  }
  if (ctx.warningTimeout) {
    clearTimeout(ctx.warningTimeout);
  }
  if (ctx.noReplyTimeout) {
    clearTimeout(ctx.noReplyTimeout);
  }
  const timeoutSeqSnapshot = ctx.activitySeq;
  ctx.timeout = setTimeout(() => {
    const latestCtx = userMenuContext[chatId];
    // Check if session still exists before sending message
    if (latestCtx && latestCtx.activitySeq === timeoutSeqSnapshot && waClient) {
      // Set cooldown first to ensure it's set even if message sending fails
      setSessionTimeoutCooldown(chatId);
      
      waClient
        .sendMessage(chatId, SESSION_EXPIRED_MESSAGE)
        .catch((e) => console.error(e));
      delete userMenuContext[chatId];
    }
  }, USER_MENU_TIMEOUT);
  const warningSeqSnapshot = ctx.activitySeq;
  ctx.warningTimeout = setTimeout(() => {
    const latestCtx = userMenuContext[chatId];
    // Check if session still exists before sending warning
    if (latestCtx && latestCtx.activitySeq === warningSeqSnapshot && waClient) {
      waClient
        .sendMessage(
          chatId,
          "⏰ *Peringatan Sesi*\n\nSesi akan berakhir dalam 2 menit.\n\n✅ Balas sesuai pilihan untuk melanjutkan dan memperpanjang sesi.\n⏹️ Ketik *batal* untuk keluar sekarang."
        )
        .catch((e) => console.error(e));
    }
  }, USER_MENU_TIMEOUT - MENU_WARNING);
  if (expectReply) {
    const noReplySeqSnapshot = ctx.activitySeq;
    ctx.noReplyTimeout = setTimeout(() => {
      const latestCtx = userMenuContext[chatId];
      // Check if session still exists before sending reminder
      if (latestCtx && latestCtx.activitySeq === noReplySeqSnapshot && waClient) {
        waClient
          .sendMessage(
            chatId,
            "🤖 *Menunggu Balasan*\n\nKami masih menunggu balasan Anda.\n\n✍️ Silakan jawab sesuai instruksi untuk melanjutkan.\n❓ Ketik *batal* jika ingin keluar.\n\n⏱️ Sisa waktu: ~3 menit sebelum sesi berakhir."
          )
          .catch((e) => console.error(e));
      }
    }, NO_REPLY_TIMEOUT);
  }
}

/**
 * Tandai aktivitas terbaru pada sesi menu user dengan counter monotonic.
 * @param {object} session
 */
export function markUserMenuActivity(session) {
  if (!session || typeof session !== "object") {
    return;
  }
  const currentSeq = Number.isFinite(session.activitySeq) ? session.activitySeq : 0;
  session.activitySeq = currentSeq + 1;
  session.lastActivityAt = Date.now();
}

// Timeout untuk proses binding WhatsApp
export function setBindTimeout(chatId) {
  if (waBindSessions[chatId]?.timeout) {
    clearTimeout(waBindSessions[chatId].timeout);
  }
  waBindSessions[chatId].timeout = setTimeout(() => {
    delete waBindSessions[chatId];
  }, BIND_TIMEOUT);
}

// Timeout untuk pilihan operator/menu user
export function setOperatorOptionTimeout(chatId) {
  if (operatorOptionSessions[chatId]?.timeout) {
    clearTimeout(operatorOptionSessions[chatId].timeout);
  }
  operatorOptionSessions[chatId].timeout = setTimeout(() => {
    delete operatorOptionSessions[chatId];
  }, MENU_TIMEOUT);
}

// Timeout untuk pilihan admin
export function setAdminOptionTimeout(chatId) {
  if (adminOptionSessions[chatId]?.timeout) {
    clearTimeout(adminOptionSessions[chatId].timeout);
  }
  adminOptionSessions[chatId].timeout = setTimeout(() => {
    delete adminOptionSessions[chatId];
  }, MENU_TIMEOUT);
}

export function setUserRequestLinkTimeout(chatId) {
  const session = userRequestLinkSessions[chatId];
  if (!session) {
    return;
  }
  if (session.timeout) {
    clearTimeout(session.timeout);
  }
  session.timeout = setTimeout(() => {
    delete userRequestLinkSessions[chatId];
  }, USER_REQUEST_LINK_TIMEOUT);
}

// =======================
// UTILITY UNTUK SESSION CLIENTREQUEST
// =======================

/**
 * Set session untuk clientrequest.
 * @param {string} chatId 
 * @param {object} data 
 */
export function setSession(chatId, data) {
  clientRequestSessions[chatId] = { ...data, time: Date.now() };
}

/**
 * Get session untuk clientrequest. Otomatis auto-expire setelah timeout.
 * @param {string} chatId 
 * @returns {object|null}
 */
export function getSession(chatId) {
  const s = clientRequestSessions[chatId];
  if (!s) return null;
  if (Date.now() - s.time > SESSION_TIMEOUT) {
    delete clientRequestSessions[chatId];
    return null;
  }
  return s;
}

/**
 * Hapus session clientrequest untuk chatId.
 * @param {string} chatId 
 */
export function clearSession(chatId) {
  delete clientRequestSessions[chatId];
}

// =======================
// COOLDOWN MANAGEMENT FOR AUTO-START
// =======================

/**
 * Set cooldown after session timeout to prevent immediate auto-start
 * @param {string} chatId 
 */
export function setSessionTimeoutCooldown(chatId) {
  sessionTimeoutCooldowns[chatId] = Date.now();
  // Auto-cleanup after cooldown period
  setTimeout(() => {
    delete sessionTimeoutCooldowns[chatId];
  }, AUTO_START_COOLDOWN);
}

/**
 * Check if chatId is in cooldown period after timeout
 * @param {string} chatId 
 * @returns {boolean}
 */
export function isInTimeoutCooldown(chatId) {
  const cooldownTime = sessionTimeoutCooldowns[chatId];
  if (!cooldownTime) return false;
  
  const elapsed = Date.now() - cooldownTime;
  if (elapsed >= AUTO_START_COOLDOWN) {
    delete sessionTimeoutCooldowns[chatId];
    return false;
  }
  return true;
}

// =======================
// END OF FILE
// =======================

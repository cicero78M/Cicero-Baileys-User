// utils/sessionsHelper.js

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

// =======================
// MESSAGE PROCESSING LOCKS
// =======================

const processingLocks = {};  // { chatId: Promise }
const lockQueues = {};       // { chatId: Array<Function> }

/**
 * Acquire a processing lock for a chatId to prevent concurrent message handling
 * Uses a queue-based approach to prevent race conditions
 * @param {string} chatId
 * @returns {Promise<Function>} Release function to call when done
 */
export async function acquireProcessingLock(chatId) {
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
  
  processingLocks[chatId] = new Promise(resolve => {
    releaseLock = () => {
      clearTimeout(timeoutId);
      delete processingLocks[chatId];
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
  
  // Safety timeout: auto-release after 30 seconds to prevent permanent deadlock
  timeoutId = setTimeout(() => {
    // Only force release if lock still exists
    if (processingLocks[chatId]) {
      console.warn(`[acquireProcessingLock] Lock timeout for chatId: ${chatId}, forcing release`);
      releaseLock();
    }
  }, 30000);
  
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
  if (ctx.timeout) {
    clearTimeout(ctx.timeout);
  }
  if (ctx.warningTimeout) {
    clearTimeout(ctx.warningTimeout);
  }
  if (ctx.noReplyTimeout) {
    clearTimeout(ctx.noReplyTimeout);
  }
  ctx.timeout = setTimeout(() => {
    if (waClient) {
      waClient
        .sendMessage(chatId, SESSION_EXPIRED_MESSAGE)
        .catch((e) => console.error(e));
    }
    delete userMenuContext[chatId];
  }, USER_MENU_TIMEOUT);
  ctx.warningTimeout = setTimeout(() => {
    if (waClient) {
      waClient
        .sendMessage(
          chatId,
          "⏰ *Peringatan Sesi*\n\nSesi akan berakhir dalam 2 menit.\n\n✅ Balas sesuai pilihan untuk melanjutkan dan memperpanjang sesi.\n⏹️ Ketik *batal* untuk keluar sekarang."
        )
        .catch((e) => console.error(e));
    }
  }, USER_MENU_TIMEOUT - MENU_WARNING);
  if (expectReply) {
    ctx.noReplyTimeout = setTimeout(() => {
      if (waClient) {
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
// END OF FILE
// =======================

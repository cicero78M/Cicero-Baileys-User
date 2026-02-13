// TTL-based cache for message deduplication to prevent memory leak
// Messages are kept for 24 hours by default (configurable via WA_MESSAGE_DEDUP_TTL_MS)
const seenMessages = new Map(); // key -> timestamp
const seenSemanticFingerprints = new Map(); // key -> timestamp
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_SEMANTIC_DEDUP_TTL_MS = 15000; // 15 seconds
const DEFAULT_SEMANTIC_DEDUP_BUCKET_MS = 5000; // 5 seconds
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Parse TTL from environment, with validation
function parseMessageDedupTTL() {
  const envValue = process.env.WA_MESSAGE_DEDUP_TTL_MS;
  if (!envValue) return DEFAULT_TTL_MS;
  
  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed < 60000) {
    console.warn(
      `[WA-EVENT-AGGREGATOR] Invalid WA_MESSAGE_DEDUP_TTL_MS="${envValue}", ` +
      `using default ${DEFAULT_TTL_MS}ms (must be >= 60000ms)`
    );
    return DEFAULT_TTL_MS;
  }
  return parsed;
}

const MESSAGE_DEDUP_TTL_MS = parseMessageDedupTTL();

function parseSemanticDedupTTL() {
  const envValue = process.env.WA_SEMANTIC_DEDUP_TTL_MS;
  if (!envValue) return DEFAULT_SEMANTIC_DEDUP_TTL_MS;

  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed < 10000 || parsed > 30000) {
    console.warn(
      `[WA-EVENT-AGGREGATOR] Invalid WA_SEMANTIC_DEDUP_TTL_MS="${envValue}", ` +
      `using default ${DEFAULT_SEMANTIC_DEDUP_TTL_MS}ms (must be between 10000ms and 30000ms)`
    );
    return DEFAULT_SEMANTIC_DEDUP_TTL_MS;
  }

  return parsed;
}

function parseSemanticDedupBucketMs() {
  const envValue = process.env.WA_SEMANTIC_DEDUP_BUCKET_MS;
  if (!envValue) return DEFAULT_SEMANTIC_DEDUP_BUCKET_MS;

  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed < 2000 || parsed > 5000) {
    console.warn(
      `[WA-EVENT-AGGREGATOR] Invalid WA_SEMANTIC_DEDUP_BUCKET_MS="${envValue}", ` +
      `using default ${DEFAULT_SEMANTIC_DEDUP_BUCKET_MS}ms (must be between 2000ms and 5000ms)`
    );
    return DEFAULT_SEMANTIC_DEDUP_BUCKET_MS;
  }

  return parsed;
}

const SEMANTIC_DEDUP_TTL_MS = parseSemanticDedupTTL();
const SEMANTIC_DEDUP_BUCKET_MS = parseSemanticDedupBucketMs();

// Periodic cleanup of expired entries to prevent memory leak
function cleanupExpiredMessages() {
  const now = Date.now();
  let removedCount = 0;
  
  for (const [key, timestamp] of seenMessages.entries()) {
    if (now - timestamp > MESSAGE_DEDUP_TTL_MS) {
      seenMessages.delete(key);
      removedCount++;
    }
  }

  for (const [key, timestamp] of seenSemanticFingerprints.entries()) {
    if (now - timestamp > SEMANTIC_DEDUP_TTL_MS) {
      seenSemanticFingerprints.delete(key);
      removedCount++;
    }
  }
  
  if (removedCount > 0 && debugLoggingEnabled) {
    console.log(
      `[WA-EVENT-AGGREGATOR] Cleaned up ${removedCount} expired message(s), ` +
      `current cache size: ${seenMessages.size}`
    );
  }
}

function getNormalizedMessageBody(msg) {
  const rawBody =
    msg?.body ||
    msg?.text ||
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    "";

  return String(rawBody)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getStepSnapshot(msg) {
  return String(
    msg?.stepSnapshot ||
      msg?.step ||
      msg?.sessionStep ||
      msg?.meta?.step ||
      "default"
  );
}

function buildSemanticFingerprint(jid, msg, now = Date.now()) {
  const normalizedBody = getNormalizedMessageBody(msg);
  if (!normalizedBody) {
    return null;
  }

  const stepSnapshot = getStepSnapshot(msg);
  const timeBucket = Math.floor(now / SEMANTIC_DEDUP_BUCKET_MS);
  return `${jid}:${normalizedBody}:${stepSnapshot}:${timeBucket}`;
}

// Start periodic cleanup
const cleanupTimer = setInterval(cleanupExpiredMessages, CLEANUP_INTERVAL_MS);

// Ensure cleanup timer doesn't prevent process from exiting
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

// Enable debug logging only when WA_DEBUG_LOGGING is set to "true"
const debugLoggingEnabled = process.env.WA_DEBUG_LOGGING === 'true';

/**
 * Deduplicate incoming messages.
 * @param {string} fromAdapter
 * @param {object} msg
 * @param {(msg: object) => void} handler
 * @param {{ allowReplay?: boolean }} [options]
 */
export function handleIncoming(fromAdapter, msg, handler, options = {}) {
  const { allowReplay = false } = options;
  const jid = msg.key?.remoteJid || msg.from;
  const id = msg.key?.id || msg.id?.id || msg.id?._serialized;
  
  if (debugLoggingEnabled) {
    console.log(`[WA-EVENT-AGGREGATOR] Message received from adapter: ${fromAdapter}, jid: ${jid}, id: ${id}`);
  }
  
  const invokeHandler = () =>
    Promise.resolve(handler(msg)).catch((error) => {
      console.error("[WA] handler error", {
        jid,
        id,
        fromAdapter,
        error,
      });
    });
  if (!jid || !id) {
    if (debugLoggingEnabled) {
      console.log(`[WA-EVENT-AGGREGATOR] Invoking handler without jid/id (jid: ${jid}, id: ${id})`);
    }
    // Log warning for missing IDs to track potential issues
    if (!debugLoggingEnabled && (!jid || !id)) {
      console.warn(
        `[WA-EVENT-AGGREGATOR] Message missing identifier - jid: ${jid}, id: ${id}, ` +
        `fromAdapter: ${fromAdapter}`
      );
    }
    invokeHandler();
    return;
  }
  const key = `${jid}:${id}`;
  const now = Date.now();
  if (!allowReplay && seenMessages.has(key)) {
    if (debugLoggingEnabled) {
      console.log(`[WA-EVENT-AGGREGATOR] Duplicate message detected, skipping: ${key}`);
    }
    return;
  }

  const semanticFingerprint = buildSemanticFingerprint(jid, msg, now);
  if (semanticFingerprint && seenSemanticFingerprints.has(semanticFingerprint)) {
    if (debugLoggingEnabled) {
      console.log(
        `[WA-EVENT-AGGREGATOR] Semantic duplicate detected, skipping: ${semanticFingerprint}`
      );
    }
    return;
  }

  if (debugLoggingEnabled) {
    console.log(`[WA-EVENT-AGGREGATOR] Processing message from ${fromAdapter}: ${key}`);
  }
  if (allowReplay && debugLoggingEnabled) {
    console.log(`[WA-EVENT-AGGREGATOR] Allowing replay for message ID dedup: ${key}`);
  }

  seenMessages.set(key, now);
  if (semanticFingerprint) {
    seenSemanticFingerprints.set(semanticFingerprint, now);
  }
  invokeHandler();
}

/**
 * Get statistics about the message deduplication cache
 * @returns {{
 *  idDedup: { size: number, ttlMs: number, oldestEntryAgeMs: number },
 *  semanticDedup: { size: number, ttlMs: number, bucketMs: number, oldestEntryAgeMs: number }
 * }}
 */
export function getMessageDedupStats() {
  const now = Date.now();
  let oldestIdTimestamp = now;
  let oldestSemanticTimestamp = now;
  
  for (const timestamp of seenMessages.values()) {
    if (timestamp < oldestIdTimestamp) {
      oldestIdTimestamp = timestamp;
    }
  }

  for (const timestamp of seenSemanticFingerprints.values()) {
    if (timestamp < oldestSemanticTimestamp) {
      oldestSemanticTimestamp = timestamp;
    }
  }
  
  return {
    idDedup: {
      size: seenMessages.size,
      ttlMs: MESSAGE_DEDUP_TTL_MS,
      oldestEntryAgeMs: now - oldestIdTimestamp,
    },
    semanticDedup: {
      size: seenSemanticFingerprints.size,
      ttlMs: SEMANTIC_DEDUP_TTL_MS,
      bucketMs: SEMANTIC_DEDUP_BUCKET_MS,
      oldestEntryAgeMs: now - oldestSemanticTimestamp,
    },
  };
}

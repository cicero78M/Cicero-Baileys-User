import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import redis from '../config/redis.js';
import { syncContactForWorker } from './googleContactsService.js';

const queueName = 'contact-sync';
const dedupTtlSec = Number(process.env.CONTACT_SYNC_DEDUP_TTL_SEC) || 180;
const removeOnCompleteAgeSec =
  Number(process.env.CONTACT_SYNC_REMOVE_ON_COMPLETE_AGE_SEC) || 3600;
const removeOnFailAgeSec =
  Number(process.env.CONTACT_SYNC_REMOVE_ON_FAIL_AGE_SEC) || 86400;
const workerConcurrency = Number(process.env.CONTACT_SYNC_WORKER_CONCURRENCY) || 2;

const redisUrl = new URL(env.REDIS_URL);
const queueConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
  ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
};

const contactSyncQueue = new Queue(queueName, {
  connection: queueConnection,
});

function normalizePhone(rawValue = '') {
  return String(rawValue).replace(/[^0-9]/g, '');
}

function getDedupKey(phone) {
  return `contact_sync:dedup:${phone}`;
}

let workerInstance = null;

export async function enqueueContactSync(rawPhone, context = {}) {
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return { enqueued: false, reason: 'invalid_phone' };
  }

  const dedupKey = getDedupKey(phone);
  let acquired = false;

  try {
    const dedupRes = await redis.set(dedupKey, '1', {
      NX: true,
      EX: dedupTtlSec,
    });
    acquired = dedupRes === 'OK';
  } catch (error) {
    console.warn(`[CONTACT SYNC] dedup check failed for ${phone}:`, error.message);
  }

  if (!acquired) {
    return { enqueued: false, reason: 'dedup_ttl' };
  }

  await contactSyncQueue.add(
    'sync-contact',
    {
      phone,
      source: context.source || 'wa_message',
      chatId: context.chatId || null,
      enqueuedAt: Date.now(),
    },
    {
      jobId: `contact-sync:${phone}`,
      removeOnComplete: { age: removeOnCompleteAgeSec, count: 1000 },
      removeOnFail: { age: removeOnFailAgeSec, count: 1000 },
      attempts: 4,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  return { enqueued: true, phone };
}

export function initializeContactSyncWorker() {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker(
    queueName,
    async (job) => {
      const { phone } = job.data || {};
      return syncContactForWorker(phone);
    },
    {
      connection: queueConnection,
      concurrency: workerConcurrency,
    }
  );

  workerInstance.on('failed', (job, error) => {
    console.error(
      `[CONTACT SYNC] job failed for ${job?.data?.phone || 'unknown'}:`,
      error?.message || error
    );
  });

  return workerInstance;
}

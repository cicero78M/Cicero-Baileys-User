import { Queue, Worker } from 'bullmq';
import Bottleneck from 'bottleneck';

/**
 * Simple outbox queue for WhatsApp messages.
 * Jobs are rate limited globally to avoid hitting API limits.
 */
const queueName = 'wa-outbox';
export const outboxQueue = new Queue(queueName);

const outboxMetrics = {
  processed: 0,
  failed: 0,
  latencyMsTotal: 0,
  latencyMsMax: 0,
  lastProcessedAt: null,
  lastFailedAt: null,
};

const limiter = new Bottleneck({
  minTime: 350,
  reservoir: 40,
  reservoirRefreshInterval: 60_000,
  reservoirRefreshAmount: 40,
});

export async function enqueueSend(jid, payload, options = {}) {
  const { priority = 'low', attempts = 5, backoffDelayMs = 2000 } = options;
  const normalizedPriority = String(priority).toLowerCase() === 'high' ? 10 : 1;

  await outboxQueue.add('send', { jid, payload, enqueuedAt: Date.now() }, {
    removeOnComplete: true,
    attempts,
    backoff: { type: 'exponential', delay: backoffDelayMs },
    priority: normalizedPriority,
  });
}

export function attachWorker(adapter) {
  // Adapter must implement sendText and optionally sendMedia
  const worker = new Worker(queueName, async (job) => {
    const { jid, payload } = job.data;
    return limiter.schedule(async () => {
      if (payload.mediaPath && adapter.sendMedia) {
        return adapter.sendMedia(jid, payload.mediaPath, payload.text);
      }
      return adapter.sendText(jid, payload.text);
    });
  });

  worker.on('completed', (job) => {
    const latencyMs = Math.max(0, Date.now() - Number(job?.data?.enqueuedAt || Date.now()));
    outboxMetrics.processed += 1;
    outboxMetrics.latencyMsTotal += latencyMs;
    outboxMetrics.latencyMsMax = Math.max(outboxMetrics.latencyMsMax, latencyMs);
    outboxMetrics.lastProcessedAt = new Date().toISOString();
  });

  worker.on('failed', () => {
    outboxMetrics.failed += 1;
    outboxMetrics.lastFailedAt = new Date().toISOString();
  });

  return worker;
}

export async function getOutboxMetrics() {
  const counts = await outboxQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed');
  const averageLatencyMs =
    outboxMetrics.processed > 0
      ? Number((outboxMetrics.latencyMsTotal / outboxMetrics.processed).toFixed(2))
      : 0;

  return {
    queueDepth: (counts.waiting || 0) + (counts.active || 0) + (counts.delayed || 0),
    queueCounts: counts,
    sendLatencyMs: {
      average: averageLatencyMs,
      max: outboxMetrics.latencyMsMax,
    },
    processed: outboxMetrics.processed,
    failed: outboxMetrics.failed,
    lastProcessedAt: outboxMetrics.lastProcessedAt,
    lastFailedAt: outboxMetrics.lastFailedAt,
  };
}

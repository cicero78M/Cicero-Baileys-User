import express from 'express';
import { getWaReadinessSummary } from '../service/waService.js';
import { getOutboxMetrics } from '../service/waOutbox.js';
import { getMessageDedupStats } from '../service/waEventAggregator.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { clients, shouldInitWhatsAppClients } = await getWaReadinessSummary();
  const dedupStats = getMessageDedupStats();
  const outboxMetrics = await getOutboxMetrics();
  
  res.status(200).json({
    status: 'ok',
    shouldInitWhatsAppClients,
    clients,
    waOutbox: outboxMetrics,
    messageDeduplication: {
      cacheSize: dedupStats.size,
      ttlMs: dedupStats.ttlMs,
      oldestEntryAgeMs: dedupStats.oldestEntryAgeMs,
      ttlHours: Math.round(dedupStats.ttlMs / 3600000),
    },
  });
});

export default router;

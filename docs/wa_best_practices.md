# WhatsApp Bot Best Practices Guide - Cicero V2

## Overview

This guide documents best practices for WhatsApp bot message reception and processing in Cicero V2, aligned with the current Baileys runtime and single-client architecture.

## Architecture Overview

### Message Flow

```
Baileys Client (`waUserClient`)
    ↓
Adapter Layer (`baileysAdapter.js`)
    ↓
Event Emitter (`message` event)
    ↓
External Listener (`waService.js`)
    ↓
Message Deduplication (`waEventAggregator.js`)
    ↓
Handler Functions
    ↓
Business Logic Processing
```

### Key Components

1. **baileysAdapter.js**: Baileys client wrapper
   - Manages client lifecycle (connect, ready, disconnect)
   - Registers internal event handlers
   - Emits events to external listeners
   - Handles reinitialization without losing external listeners

2. **waService.js**: Main WhatsApp service
   - Creates one runtime client (`waUserClient`) and exposes `waClient` as alias kompatibilitas
   - Attaches external message listeners
   - Routes messages to appropriate handlers
   - Manages readiness state and deferred messages

3. **waEventAggregator.js**: Message deduplication
   - Prevents duplicate message processing
   - Handles normalized message source from adapter/service boundary
   - Dual dedup layers: ID-level (`jid:id`) and semantic fingerprint (`jid + normalizedBody + stepSnapshot + timeBucket`)
   - TTL-based cache to prevent memory leaks
   - Automatic cleanup of expired entries

## Best Practices

### 1. Memory Management ✅

**DO**:
- Use TTL-based caching for temporary data
- Implement periodic cleanup for caches
- Monitor cache sizes via health endpoints
- Set appropriate TTL based on use case

**DON'T**:
- Use unbounded Sets or Maps for long-running processes
- Store data indefinitely without cleanup
- Ignore memory metrics in production

**Example**:
```javascript
// GOOD: TTL-based cache with cleanup
const cache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of cache.entries()) {
    if (now - timestamp > TTL) {
      cache.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

// BAD: Unbounded cache
const cache = new Set();
cache.add(item); // Never removed!
```

### 2. Event Listener Management ✅

**DO**:
- Store references to internal event handlers
- Use `removeListener(event, handler)` instead of `removeAllListeners(event)`
- Preserve external listeners during reinitialization
- Test listener preservation in unit tests

**DON'T**:
- Use `removeAllListeners()` when external listeners exist
- Forget to store handler references for cleanup
- Assume all listeners are internal

**Example**:
```javascript
// GOOD: Preserves external listeners
let internalHandler = null;

const registerListeners = () => {
  if (internalHandler) {
    client.removeListener('message', internalHandler);
  }
  internalHandler = (msg) => { /* handle */ };
  client.on('message', internalHandler);
};

// BAD: Removes ALL listeners including external ones
client.removeAllListeners('message'); // ⚠️ Dangerous!
```

### 3. Error Handling ✅

**DO**:
- Wrap async operations in try-catch
- Log errors with context (jid, id, adapter)
- Continue processing even if one message fails
- Use Promise.catch() for handler errors

**DON'T**:
- Let errors crash the entire service
- Ignore error context
- Fail silently without logging

**Example**:
```javascript
// GOOD: Robust error handling
const invokeHandler = () =>
  Promise.resolve(handler(msg)).catch((error) => {
    console.error("[WA] handler error", {
      jid: msg.from,
      id: msg.id,
      fromAdapter,
      error,
    });
  });

// BAD: Unhandled errors
handler(msg); // Can crash if handler throws
```

### 4. Configuration Management ✅

**DO**:
- Provide sensible defaults
- Validate environment variables
- Document all configuration options
- Fail fast on invalid configuration

**DON'T**:
- Assume environment variables are always valid
- Use magic numbers in code
- Skip input validation

**Example**:
```javascript
// GOOD: Validated configuration
function parseConfig() {
  const envValue = process.env.CONFIG_VALUE;
  if (!envValue) return DEFAULT_VALUE;
  
  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed) || parsed < MIN_VALUE) {
    console.warn(`Invalid CONFIG_VALUE="${envValue}", using default`);
    return DEFAULT_VALUE;
  }
  return parsed;
}

// BAD: No validation
const config = parseInt(process.env.CONFIG_VALUE); // NaN if invalid!
```

### 5. Debug Logging ✅

**DO**:
- Gate debug logs behind environment variable
- Include context in log messages (jid, id, adapter)
- Log at appropriate levels (debug, info, warn, error)
- Provide troubleshooting visibility

**DON'T**:
- Log everything by default (log spam)
- Log without context
- Forget to disable debug logs in production

**Example**:
```javascript
// GOOD: Conditional debug logging
const debugEnabled = process.env.WA_DEBUG_LOGGING === 'true';

if (debugEnabled) {
  console.log(`[WA] Processing message from ${msg.from}`);
}

// Always log warnings/errors
console.warn(`[WA] Unexpected condition: ${details}`);

// BAD: Always logging
console.log(`Processing ${msg.from}`); // Log spam!
```

### 6. Monitoring & Observability ✅

**DO**:
- Expose health check endpoints
- Include metrics in health checks
- Track cache sizes, rates, and errors
- Monitor trends over time

**DON'T**:
- Deploy without monitoring
- Ignore metric trends
- Skip health check validation

**Example**:
```javascript
// GOOD: Health endpoint with metrics
app.get('/health/wa', (req, res) => {
  res.json({
    status: 'ok',
    clients: getClientStatus(),
    deduplication: getCacheStats(),
    uptime: process.uptime(),
  });
});

// BAD: No observability
// No way to check system state
```

### Inbound Handler Non-Blocking Acknowledgement ✅

**DO**:
- Send `sendSeen(chatId)` in fire-and-forget mode (`.catch`) so inbound handler remains non-blocking
- Apply seen throttling per `chatId` (minimum interval per chat), not global sleep per message
- Keep seen acknowledgement best-effort and do not affect core business flow

**DON'T**:
- Use `await sleep(...)` before `sendSeen` inside inbound handler
- Block all inbound processing for a single chat acknowledgement
- Share a global seen delay across all chats

**Example**:
```javascript
// GOOD: Non-blocking sendSeen with per-chat throttle
if (shouldDispatchSeen(waClient, chatId)) {
  waClient.sendSeen(chatId).catch((error) => {
    console.warn(`[WA] Failed to mark ${chatId} as read`, error);
  });
}

// BAD: Blocking handler path
await sleep(1000);
await waClient.sendSeen(chatId);
```

### 7. Testing Strategy ✅

**DO**:
- Test message flow end-to-end
- Test error conditions
- Test reinitialization scenarios
- Test listener preservation
- Use mocks for external dependencies

**DON'T**:
- Only test happy path
- Skip edge cases
- Forget to test cleanup logic

**Example**:
```javascript
// GOOD: Comprehensive test
test('preserves external listeners during reinit', async () => {
  const client = await createClient();
  const externalHandler = jest.fn();
  
  // Attach external listener
  client.on('message', externalHandler);
  
  // Trigger reinitialization
  await client.reinitialize();
  
  // Emit message
  // Should still call external handler
  expect(externalHandler).toHaveBeenCalled();
});
```

### 8. Resource Cleanup ✅

**DO**:
- Use `timer.unref()` for periodic tasks
- Clean up on process exit if needed
- Prevent memory leaks from timers
- Close connections properly

**DON'T**:
- Let timers prevent process exit
- Forget to cleanup resources
- Create resource leaks

**Example**:
```javascript
// GOOD: Doesn't prevent exit
const timer = setInterval(cleanup, INTERVAL);
if (timer.unref) {
  timer.unref();
}

// BAD: Blocks exit
setInterval(cleanup, INTERVAL); // Process won't exit!
```

## Common Issues & Solutions

### Issue 1: Messages Not Being Received

**Symptoms**:
- Bot doesn't respond to messages
- No logs showing message reception
- Users report bot is offline

**Diagnosis**:
1. Check `WA_SERVICE_SKIP_INIT` environment variable
   ```bash
   echo $WA_SERVICE_SKIP_INIT
   # Should be unset or "false"
   ```

2. Check health endpoint:
   ```bash
   curl http://localhost:3000/api/health/wa | jq
   ```

3. Verify listener attachment in logs:
   ```
   [WA] Attaching message event listeners...
   [WA] Message event listeners attached successfully.
   [WA DIAGNOSTICS] ✓ waClient has 1 'message' listener(s)
   ```

**Solution**:
- Ensure `WA_SERVICE_SKIP_INIT` is not set to "true"
- Verify clients are initialized (`shouldInitWhatsAppClients: true`)
- Check client readiness state
- Enable debug logging: `WA_DEBUG_LOGGING=true`

### Issue 2: Memory Growth Over Time

**Symptoms**:
- Server memory increases continuously
- No obvious memory leak in application code
- Cache sizes keep growing

**Diagnosis**:
1. Check deduplication cache size:
   ```bash
   curl http://localhost:3000/api/health/wa | jq .messageDeduplication
   ```

2. Monitor cache size trend over 24+ hours

3. Check if cleanup is running (enable debug logging)

**Solution**:
- Verify TTL-based cache is in use (post-fix)
- Adjust `WA_MESSAGE_DEDUP_TTL_MS` if needed
- Check for other unbounded caches in code
- Monitor with memory profiler

### Issue 3: Duplicate Message Processing

**Symptoms**:
- Users receive duplicate responses
- Same message processed multiple times
- Logs show duplicate message IDs

**Diagnosis**:
1. Enable debug logging to see deduplication flow:
   ```bash
   WA_DEBUG_LOGGING=true
   ```

2. Check for messages without IDs:
   ```
   [WA-EVENT-AGGREGATOR] Message missing identifier
   ```

3. Verify deduplication cache is working

**Solution**:
- Ensure message IDs are present
- Check if `allowReplay` is being set incorrectly
- Verify cache TTL is not too short
- Check for race conditions in message handling

### Issue 4: Client Reinitialization Loop

**Symptoms**:
- Client keeps reinitializing
- Logs show repeated "Reinitializing clientId=" messages
- Bot is intermittently available

**Diagnosis**:
1. Check for authentication failures
2. Review disconnect reasons in logs
3. Check Chrome/Chromium availability
4. Verify session data integrity

**Solution**:
- Scan QR code if needed
- Check `WA_AUTH_DATA_PATH` permissions
- Verify Chrome installation
- Review session clearing settings

## Configuration Reference

### Environment Variables

```bash
# === Core Configuration ===
WA_SERVICE_SKIP_INIT=false
WA_DEBUG_LOGGING=false
WA_MESSAGE_DEDUP_TTL_MS=86400000
WA_SEMANTIC_DEDUP_TTL_MS=15000
WA_SEMANTIC_DEDUP_BUCKET_MS=5000

# === Current Runtime Truth ===
# Satu client aktif: waUserClient (alias: waClient)
USER_WA_CLIENT_ID=wa-userrequest-prod

# === Session Management ===
WA_AUTH_DATA_PATH=
WA_AUTH_CLEAR_SESSION_ON_REINIT=false
```

| Runtime Fact | Nilai |
|---|---|
| Jumlah client aktif | 1 |
| Nama instance aktif | `waUserClient` |
| Alias | `waClient` |
| Path session | `<WA_AUTH_DATA_PATH>/session-<USER_WA_CLIENT_ID>` (default `~/.cicero/baileys_auth/...`) |

**Migration note:** variabel lama `GATEWAY_WA_CLIENT_ID` / `APP_SESSION_NAME` tidak dipakai pada runtime WA saat ini dan sebaiknya dihapus dari konfigurasi aktif.

### Default Values

| Setting | Default | Min | Max | Description |
|---------|---------|-----|-----|-------------|
| `WA_MESSAGE_DEDUP_TTL_MS` | 86400000 (24h) | 60000 (1m) | - | ID-level dedup cache TTL (`jid:id`) |
| `WA_SEMANTIC_DEDUP_TTL_MS` | 15000 (15s) | 10000 (10s) | 30000 (30s) | Semantic dedup cache TTL |
| `WA_SEMANTIC_DEDUP_BUCKET_MS` | 5000 (5s) | 2000 (2s) | 5000 (5s) | Semantic dedup time bucket |
| `WA_WWEBJS_PROTOCOL_TIMEOUT_MS` | 120000 (2m) | - | 300000 | Protocol timeout |
| `WA_STORE_INIT_DELAY_MS` | 2000 | 0 | - | Store init delay |

## Monitoring Checklist

### Startup
- [ ] "Attaching message event listeners" log appears
- [ ] Runtime client (`waUserClient` / alias `waClient`) shows listener count > 0
- [ ] Clients reach ready state within timeout
- [ ] No authentication failures

### Runtime
- [ ] Messages are processed (check logs with debug enabled)
- [ ] Cache size stabilizes at expected volume
- [ ] No memory growth over time
- [ ] Cleanup runs every hour (if debug enabled)
- [ ] No unexpected reinitialization loops

### Health Check
```bash
curl http://localhost:3000/api/health/wa | jq
```

Expected response:
```json
{
  "status": "ok",
  "shouldInitWhatsAppClients": true,
  "clients": [
    {
      "label": "waClient",
      "messageListenerCount": 1,
      "readyListenerCount": 1,
      "state": "ready"
    }
  ],
  "messageDeduplication": {
    "cacheSize": 150,
    "ttlMs": 86400000,
    "oldestEntryAgeMs": 3600000,
    "ttlHours": 24
  }
}
```

## Deployment Checklist

### Pre-Deployment
- [ ] Review and update environment variables
- [ ] Verify `WA_SERVICE_SKIP_INIT` is not "true"
- [ ] Verify `WA_DEBUG_LOGGING` is not "true" (unless troubleshooting)
- [ ] Run tests: `npm test`
- [ ] Run linter: `npm run lint`
- [ ] Review configuration documentation

### Deployment
- [ ] Deploy updated code
- [ ] Restart application/service
- [ ] Verify clients initialize successfully
- [ ] Check startup logs for errors
- [ ] Verify health endpoint responds

### Post-Deployment
- [ ] Send test messages to verify reception
- [ ] Monitor health endpoint metrics
- [ ] Check cache size trend over 24 hours
- [ ] Verify memory usage is stable
- [ ] Monitor for any errors in logs

## Performance Considerations

### Message Processing
- **Throughput**: Designed for 100s of messages/second
- **Latency**: Sub-millisecond deduplication check
- **Memory**: ~100 bytes per cached message
- **Cleanup**: O(n) every hour, negligible CPU impact

### Cache Sizing
```
Estimated Cache Size = (Messages per Day) × (TTL in Days)

Example: 10,000 messages/day × 1 day = 10,000 entries
Memory: 10,000 × 100 bytes = ~1 MB
```

Adjust TTL based on:
- Message volume
- Available memory
- Duplicate risk tolerance

## Security Considerations

### Authentication
- Session data stored locally in `WA_AUTH_DATA_PATH`
- QR code shown only on first initialization
- Session persists between restarts
- Use `WA_AUTH_CLEAR_SESSION_ON_REINIT=true` to force re-auth

### Access Control
- Admin WhatsApp numbers: `ADMIN_WHATSAPP`
- Client operator numbers: `CLIENT_OPERATOR`

### Data Privacy
- Messages are processed in memory, not persisted by default
- Deduplication cache stores only message IDs (jid:id)
- Automatic cleanup after TTL expiry
- No message content stored in cache

## Troubleshooting Tools

### 1. Debug Logging
```bash
WA_DEBUG_LOGGING=true npm start
```

Shows detailed message flow:
```
[BAILEYS-ADAPTER] Raw message received
[BAILEYS-ADAPTER] Emitting 'message' event
[WA-SERVICE] waClient received message
[WA-EVENT-AGGREGATOR] Message received from adapter
[WA-EVENT-AGGREGATOR] Processing normalized message
```

### 2. Health Endpoint
```bash
# Full health check
curl http://localhost:3000/api/health/wa | jq

# Just deduplication stats
curl http://localhost:3000/api/health/wa | jq .messageDeduplication

# Monitor cache size
watch -n 60 'curl -s http://localhost:3000/api/health/wa | jq .messageDeduplication.cacheSize'
```

### 3. Test Script
```bash
node scripts/test-wa-setup.js
```

### 4. Diagnostics
Check listener attachment:
```javascript
import { checkMessageListenersAttached } from './src/utils/waDiagnostics.js';
checkMessageListenersAttached();
```

## References

### Documentation
- `docs/wa_memory_leak_fix.md` - Memory leak fix details
- `docs/wa_troubleshooting.md` - Troubleshooting guide
- `docs/wa_message_fix_guide.md` - Message reception fix
- `docs/whatsapp_client_lifecycle.md` - Client lifecycle
- `.env.example` - Configuration reference

### Code
- `src/service/baileysAdapter.js` - Client wrapper
- `src/service/waService.js` - Main service (5421 lines)
- `src/service/waEventAggregator.js` - Deduplication (160 lines)
- `src/utils/waDiagnostics.js` - Diagnostic utilities

### Tests
- `tests/baileysAdapter.test.js` - Adapter tests (jika tersedia pada branch ini)
- `tests/waEventAggregator.test.js` - Deduplication tests

## Support

For issues or questions:
1. Check this best practices guide
2. Review troubleshooting documentation
3. Enable debug logging
4. Check health endpoint metrics
5. Review startup and runtime logs
6. Create GitHub issue with details if problem persists

## Version History

- **2026-02-12**: Updated `sendSeen` guidance to non-blocking fire-and-forget with per-chat throttling
- **2024-02-02**: Initial best practices guide created
- **2024-02-02**: Added memory leak fix documentation
- **Previous**: Various fixes for message reception, listener preservation, store readiness

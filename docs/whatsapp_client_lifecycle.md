# WhatsApp Client Lifecycle (Current Runtime)

Dokumen ini menjelaskan lifecycle WhatsApp client yang **aktif saat ini** di Cicero_V2.

## Ringkasan runtime

Saat ini service WhatsApp menggunakan **satu instance client** yang dibuat dari `createBaileysClient()`:

- `waUserClient` → instance utama runtime.
- `waClient` → alias kompatibilitas yang menunjuk ke instance yang sama (`waUserClient`).

Implementasi ini ada di `src/service/waService.js`.

## Current Runtime Truth

| Item | Nilai runtime saat ini |
|---|---|
| Jumlah client aktif | **1** (`waUserClient`) |
| Alias kompatibilitas | `waClient` → alias dari `waUserClient` |
| Env wajib WA | `USER_WA_CLIENT_ID` (lowercase, non-default) |
| Path session | `<WA_AUTH_DATA_PATH>/session-<USER_WA_CLIENT_ID>` |
| Path session default (jika env kosong) | `~/.cicero/baileys_auth/session-<USER_WA_CLIENT_ID>` |

## Lifecycle event yang dipakai service

`waService` membaca event dari adapter Baileys:

1. `qr`
2. `authenticated`
3. `ready`
4. `disconnected`
5. `auth_failure`
6. `change_state`

Event di atas menjadi sumber utama status readiness (`ready` / `not ready`) pada runtime.

## Alur state sederhana

```text
INITIALIZED (ready=false)
   │
   ├─ qr/authenticated
   │
   └─ ready/change_state(open|CONNECTED) ──> READY (ready=true)
                                           │
                                           ├─ disconnected
                                           └─ auth_failure
                                                  ↓
                                             NOT_READY (ready=false)
```

## Session path & validasi

- `USER_WA_CLIENT_ID` harus lowercase dan tidak boleh default `wa-userrequest`.
- Jika `WA_AUTH_DATA_PATH` diisi, adapter menyimpan auth state ke `<WA_AUTH_DATA_PATH>/session-<clientId>`.
- Jika `WA_AUTH_DATA_PATH` kosong, adapter fallback ke `~/.cicero/baileys_auth`.
- `WA_AUTH_CLEAR_SESSION_ON_REINIT=true` akan menghapus folder session sebelum reinit.

## Migration note (dari arsitektur lama multi-client)

Arsitektur lama sempat memakai narasi multi-client (`waClient`, `waUserClient`, `waGatewayClient`) dan env gateway seperti `GATEWAY_WA_CLIENT_ID`.

Pada runtime saat ini:

- tidak ada instansiasi `waGatewayClient` terpisah,
- `waClient` dipertahankan sebagai alias backward compatibility,
- env gateway lama sebaiknya dihapus dari deployment agar tidak membingungkan operasional.

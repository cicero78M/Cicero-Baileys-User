# Google Contacts Integration (Deprecated)

Fitur sinkronisasi/penyimpanan kontak ke Google Contacts telah dihapus dari alur backend CICERO.

Perubahan ini mencakup:
- Penghapusan pemanggilan `saveContactIfNew` dari alur penautan dan update WhatsApp.
- Penghapusan command admin `savecontact`.
- Penghentian inisialisasi queue worker sinkronisasi kontak Google.

Dampak:
- Update field `whatsapp` hanya menyimpan data ke database internal.
- Tabel internal `saved_contact` tidak lagi diisi otomatis dari alur pesan WhatsApp.

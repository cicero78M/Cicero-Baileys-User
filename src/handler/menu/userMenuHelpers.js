// src/handler/menu/userMenuHelpers.js

/**
 * Helper functions for user menu display and formatting
 * Improves consistency and maintainability of user-facing messages
 */

import { appendSubmenuBackInstruction } from './menuPromptHelpers.js';

/**
 * Format user data for display
 * @param {Object} user - User data object
 * @returns {string} Formatted user report
 */
export function formatUserReport(user) {
  const polresName = user.client_name || user.client_id || '-';
  const statusIcon = user.status === true || user.status === 'true' ? '🟢' : '🔴';
  const statusText = user.status === true || user.status === 'true' ? 'AKTIF' : 'NONAKTIF';
  
  return [
    '👤 *Identitas Anda*',
    '',
    `*Nama Polres*: ${polresName}`,
    `*Nama*     : ${user.nama || '-'}`,
    `*Pangkat*  : ${user.title || '-'}`,
    `*NRP/NIP*  : ${user.user_id || '-'}`,
    `*Satfung*  : ${user.divisi || '-'}`,
    `*Jabatan*  : ${user.jabatan || '-'}`,
    ...(user.ditbinmas ? [`*Desa Binaan* : ${user.desa || '-'}`] : []),
    `*Instagram*: ${user.insta ? '@' + user.insta.replace(/^@/, '') : '-'}`,
    `*TikTok*   : ${user.tiktok || '-'}`,
    `*Status*   : ${statusIcon} ${statusText}`,
  ]
    .join('\n')
    .trim();
}

/**
 * Get field display name and current value
 * @param {string} fieldKey - Field key (e.g., 'pangkat', 'satfung')
 * @param {Object} user - User data object
 * @returns {{displayName: string, value: string}}
 */
export function getFieldInfo(fieldKey, user) {
  const fieldMap = {
    nama: { displayName: 'Nama', value: user?.nama || '-' },
    pangkat: { displayName: 'Pangkat', value: user?.title || '-' },
    satfung: { displayName: 'Satfung', value: user?.divisi || '-' },
    jabatan: { displayName: 'Jabatan', value: user?.jabatan || '-' },
    insta: { displayName: 'Instagram', value: user?.insta ? `@${user.insta}` : '-' },
    tiktok: { displayName: 'TikTok', value: user?.tiktok || '-' },
    desa: { displayName: 'Desa Binaan', value: user?.desa || '-' },
  };
  
  return fieldMap[fieldKey] || { displayName: fieldKey, value: '-' };
}

/**
 * Format field selection menu
 * @param {boolean} showDesa - Whether to show desa field (for Ditbinmas users)
 * @returns {string} Formatted field menu
 */
export function formatFieldList(showDesa = false) {
  return appendSubmenuBackInstruction(
    `
✏️ *Pilih Field yang Ingin Diupdate:*

1️⃣ Nama
2️⃣ Pangkat
3️⃣ Satfung
4️⃣ Jabatan
5️⃣ Instagram
6️⃣ TikTok${showDesa ? '\n7️⃣ Desa Binaan' : ''}

📝 Balas dengan *angka* (contoh: 1) atau ketik *batal* untuk keluar.

⏱️ Sesi aktif: 5 menit
`.trim()
  );
}

/**
 * Format field update prompt with current value and examples
 * @param {string} fieldKey - Field key
 * @param {string} displayName - Field display name
 * @param {string} currentValue - Current field value
 * @returns {string} Formatted prompt
 */
export function formatFieldUpdatePrompt(fieldKey, displayName, currentValue) {
  const examples = {
    nama: '💡 Contoh: BUDI SANTOSO',
    pangkat: '💡 Pilih dari daftar di atas menggunakan angka atau ketik nama pangkat',
    satfung: '💡 Pilih dari daftar di atas menggunakan angka atau ketik nama satfung',
    jabatan: '💡 Contoh: KASAT BINMAS',
    insta: '💡 Contoh: https://instagram.com/username atau @username',
    tiktok: '💡 Contoh: https://tiktok.com/@username atau @username',
    desa: '💡 Contoh: DESA SUKAMAJU',
  };
  
  const example = examples[fieldKey] || '';
  
  return [
    `📝 *Update ${displayName}*`,
    '',
    `📌 Nilai saat ini: *${currentValue}*`,
    '',
    `✍️ Ketik nilai baru untuk field *${displayName}*:`,
    example ? `${example}` : '',
    '',
    '⏹️ Ketik *batal* untuk membatalkan.',
    '↩️ Ketik *menu* untuk kembali ke daftar field.',
    '⏱️ Sesi aktif: 5 menit',
  ]
    .filter(Boolean)
    .join('\n')
    .trim();
}

/**
 * Format confirmation message
 * @param {string} action - Action being confirmed
 * @returns {string} Formatted confirmation message
 */
export function formatConfirmation(action) {
  return `${action}\n\nBalas *ya* untuk melanjutkan atau *tidak* untuk membatalkan.`;
}

/**
 * Format success message for field update
 * @param {string} fieldDisplayName - Field display name
 * @param {string} newValue - New value set
 * @param {string} userId - User ID (NRP/NIP)
 * @returns {string} Success message
 */
export function formatUpdateSuccess(fieldDisplayName, newValue, userId) {
  return [
    `✅ *Update Berhasil*`,
    '',
    `Data *${fieldDisplayName}* untuk NRP/NIP *${userId}* berhasil diupdate menjadi *${newValue}*.`,
    '',
    '📋 Anda akan kembali ke menu utama...',
  ].join('\n');
}

/**
 * Get field display name for messages
 * @param {string} dbField - Database field name
 * @returns {string} Display name
 */
export function getFieldDisplayName(dbField) {
  const displayNames = {
    title: 'Pangkat',
    divisi: 'Satfung',
    desa: 'Desa Binaan',
    nama: 'Nama',
    jabatan: 'Jabatan',
    insta: 'Instagram',
    tiktok: 'TikTok',
    whatsapp: 'WhatsApp',
  };
  
  return displayNames[dbField] || dbField.charAt(0).toUpperCase() + dbField.slice(1);
}

/**
 * Format list of options with numbers
 * @param {Array<string>} options - List of options
 * @param {string} title - List title
 * @returns {string} Formatted list
 */
export function formatOptionsList(options, title) {
  const list = options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
  return [
    `📋 *${title}*`,
    '',
    list,
    '',
    '✍️ Balas dengan *angka* atau ketik nama sesuai daftar.',
    '⏹️ Ketik *batal* untuk membatalkan.',
    '⏱️ Sesi aktif: 5 menit',
  ].join('\n');
}

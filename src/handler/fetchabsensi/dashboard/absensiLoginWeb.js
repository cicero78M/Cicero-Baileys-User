import { query } from '../../../db/index.js';
import { getWebLoginCountsByActor } from '../../../model/loginLogModel.js';
import { getGreeting } from '../../../utils/utilsHelper.js';

const JAKARTA_TIME_ZONE = 'Asia/Jakarta';
const numberFormatter = new Intl.NumberFormat('id-ID');
const monthFormatter = new Intl.DateTimeFormat('id-ID', {
  month: 'long',
  year: 'numeric',
  timeZone: JAKARTA_TIME_ZONE,
});
const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: JAKARTA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toJakartaDate(date) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Tanggal tidak valid');
  }

  const parts = dateKeyFormatter.formatToParts(parsed);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  if (![year, month, day].every((part) => Number.isFinite(part))) {
    throw new Error('Gagal membaca tanggal WIB');
  }

  return { year, month, day };
}

function startOfJakartaDay(date) {
  const { year, month, day } = toJakartaDate(date);
  return new Date(Date.UTC(year, month - 1, day, -7, 0, 0, 0));
}

function endOfJakartaDay(date) {
  const { year, month, day } = toJakartaDate(date);
  return new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999));
}

function startOfJakartaMonth(date) {
  const { year, month } = toJakartaDate(date);
  return new Date(Date.UTC(year, month - 1, 1, -7, 0, 0, 0));
}

function endOfJakartaMonth(date) {
  const { year, month } = toJakartaDate(date);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, lastDay, 16, 59, 59, 999));
}

function addJakartaDays(date, days) {
  const d = startOfJakartaDay(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function resolveRange({ mode, startTime, endTime }) {
  const normalizedMode = mode === 'mingguan' ? 'mingguan' : 'harian';
  let start = startTime ? new Date(startTime) : null;
  let end = endTime ? new Date(endTime) : null;

  if (startTime && Number.isNaN(start?.getTime())) {
    throw new Error('startTime tidak valid');
  }

  if (endTime && Number.isNaN(end?.getTime())) {
    throw new Error('endTime tidak valid');
  }

  if (!start && !end) {
    const now = new Date();
    if (normalizedMode === 'mingguan') {
      const jakartaNow = toJakartaDate(now);
      const day = new Date(Date.UTC(jakartaNow.year, jakartaNow.month - 1, jakartaNow.day)).getUTCDay();
      const mondayOffset = day === 0 ? 6 : day - 1;
      start = addJakartaDays(now, -mondayOffset);
      end = endOfJakartaDay(addJakartaDays(start, 6));
    } else {
      start = startOfJakartaDay(now);
      end = endOfJakartaDay(now);
    }
  } else {
    start = start ? startOfJakartaDay(start) : startOfJakartaDay(end);
    end = end ? endOfJakartaDay(end) : endOfJakartaDay(start);
  }

  return { start, end, mode: normalizedMode };
}

function resolveMonthlyRange({ startTime, endTime }) {
  const baseDate = startTime || endTime || new Date();
  const parsed = new Date(baseDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Tanggal periode bulanan tidak valid');
  }
  const start = startOfJakartaMonth(baseDate);
  const end = endOfJakartaMonth(baseDate);
  return { start, end };
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('id-ID', {
    timeZone: JAKARTA_TIME_ZONE,
  });
}

function formatMonthYear(date) {
  return monthFormatter.format(new Date(date));
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

async function fetchActorDetails(actorIds = []) {
  if (!actorIds.length) {
    return new Map();
  }
  const uniqueIds = Array.from(new Set(actorIds.filter(Boolean)));

  const [dashboardRes, penmasRes] = await Promise.all([
    query(
      `SELECT du.dashboard_user_id AS actor_id, du.username, r.role_name AS role
       FROM dashboard_user du
       LEFT JOIN roles r ON du.role_id = r.role_id
       WHERE du.dashboard_user_id = ANY($1)`,
      [uniqueIds]
    ),
    query(
      'SELECT user_id AS actor_id, username, role FROM penmas_user WHERE user_id = ANY($1)',
      [uniqueIds]
    ),
  ]);

  const details = new Map();
  (dashboardRes.rows || []).forEach((row) => {
    details.set(row.actor_id, { ...row, source: 'dashboard' });
  });
  (penmasRes.rows || []).forEach((row) => {
    if (!details.has(row.actor_id)) {
      details.set(row.actor_id, { ...row, source: 'penmas' });
    }
  });
  return details;
}

async function fetchPolresLoginRecap({ startTime, endTime }) {
  const { rows } = await query(
    `SELECT UPPER(c.client_id) AS client_id,
            COALESCE(c.nama, c.client_id) AS nama,
            COUNT(DISTINCT ll.actor_id) AS operator_count,
            COUNT(ll.logged_at) AS login_count
     FROM clients c
     LEFT JOIN dashboard_user_clients duc ON duc.client_id = c.client_id
     LEFT JOIN login_log ll ON ll.actor_id = duc.dashboard_user_id::TEXT
       AND ll.login_source = 'web'
       AND ll.logged_at >= $1
       AND ll.logged_at <= $2
     WHERE LOWER(c.client_type) = 'org'
     GROUP BY c.client_id, c.nama`,
    [startTime, endTime]
  );

  return rows.map((row) => ({
    client_id: row.client_id,
    nama: row.nama,
    operator_count: Number(row.operator_count) || 0,
    login_count: Number(row.login_count) || 0,
  }));
}

export async function absensiLoginWeb({ mode = 'harian', startTime, endTime } = {}) {
  if (mode === 'bulanan') {
    const { start, end } = resolveMonthlyRange({ startTime, endTime });
    const polresRows = await fetchPolresLoginRecap({ startTime: start, endTime: end });
    const salam = getGreeting();
    const monthLabel = formatMonthYear(start);

    const totalPolres = polresRows.length;
    const totalOperators = polresRows.reduce((sum, row) => sum + row.operator_count, 0);
    const totalLogin = polresRows.reduce((sum, row) => sum + row.login_count, 0);

    const lines = [
      salam,
      '',
      'Mohon ijin Komandan,',
      '',
      'Frekuensi login operator berbanding lurus dengan efektivitas pemanfaatan dashboard, baik untuk absensi, monitoring, pengawasan real-time, maupun capaian likes/komentar.',
      '',
      '📊 Rekap Absensi Login Web Cicero (Bulanan)',
      `Periode: ${monthLabel}`,
      `Total login: ${formatNumber(totalLogin)}`,
      `Total operator aktif: ${formatNumber(totalOperators)} orang`,
      `Polres terlapor: ${formatNumber(totalPolres)} satuan`,
      '',
    ];

    if (!polresRows.length) {
      lines.push('Belum ada aktivitas login web pada periode ini.');
      return lines.join('\n').trim();
    }

    lines.push('Rincian per Polres:');

    const sortedPolres = [...polresRows].sort((a, b) => {
      const diff = b.login_count - a.login_count;
      if (diff !== 0) return diff;
      return String(a.nama || a.client_id || '').localeCompare(
        String(b.nama || b.client_id || ''),
        'id-ID',
        { sensitivity: 'base' }
      );
    });

    sortedPolres.forEach((row, idx) => {
      const name = (row.nama || row.client_id || '-').toString().toUpperCase();
      const operatorLabel = `${formatNumber(row.operator_count)} operator`;
      const loginLabel = `${formatNumber(row.login_count)} login`;
      lines.push(`${idx + 1}. ${name} — ${operatorLabel} | ${loginLabel}`);
    });

    return lines.join('\n').trim();
  }

  const { start, end, mode: normalizedMode } = resolveRange({ mode, startTime, endTime });
  const recapRows = await getWebLoginCountsByActor({ startTime: start, endTime: end });
  const actorIds = recapRows.map((row) => row.actor_id).filter(Boolean);
  const detailMap = await fetchActorDetails(actorIds);

  const totalParticipants = recapRows.length;
  const totalLogin = recapRows.reduce((sum, row) => sum + (Number(row.login_count) || 0), 0);

  const header = normalizedMode === 'mingguan'
    ? '🗓️ Rekap Login Web (Mingguan)'
    : '🗓️ Rekap Login Web (Harian)';
  const lines = [
    header,
    `Periode: ${formatDate(start)} - ${formatDate(end)}`,
    `Total hadir: ${formatNumber(totalParticipants)} user (${formatNumber(totalLogin)} login)`
  ];

  if (!recapRows.length) {
    lines.push('Tidak ada login web pada periode ini.');
    return lines.join('\n');
  }

  const sortedRows = [...recapRows].sort((a, b) => {
    const diff = (Number(b.login_count) || 0) - (Number(a.login_count) || 0);
    if (diff !== 0) return diff;
    return String(a.actor_id || '').localeCompare(String(b.actor_id || ''), 'id-ID', {
      sensitivity: 'base'
    });
  });

  sortedRows.forEach((row, idx) => {
    const detail = detailMap.get(row.actor_id) || {};
    const name = detail.username || detail.nama || row.actor_id || '-';
    const roleLabel = detail.role ? ` - ${String(detail.role).toUpperCase()}` : '';
    const sourceLabel = detail.source ? detail.source : 'unknown';
    lines.push(
      `${idx + 1}. ${name} (${sourceLabel}${roleLabel}) — ${formatNumber(row.login_count)} kali`
    );
  });

  return lines.join('\n');
}

export default absensiLoginWeb;

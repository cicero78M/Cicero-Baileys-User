import { query } from "../db/index.js";

export function normalizeSocialUsername(username) {
  return String(username || "").trim().replace(/^@/, "").toLowerCase();
}

export function isSocialFallbackEnabled() {
  return process.env.ENABLE_USER_SOCIAL_ACCOUNTS_FALLBACK === "true";
}

export function isMultiSocialMatchingEnabled() {
  return process.env.ENABLE_MULTI_SOCIAL_MATCHING === "true";
}

export async function fetchSocialAccountsByUserIds(users, platform) {
  const userIds = (users || [])
    .map((u) => u?.user_id)
    .filter((id) => typeof id === "string" && id.trim() !== "");
  if (!userIds.length) return new Map();

  const { rows } = await query(
    `SELECT user_id, username, account_order
     FROM user_social_accounts
     WHERE is_active = TRUE
       AND LOWER(platform) = LOWER($1)
       AND user_id = ANY($2::varchar[])
       AND btrim(COALESCE(username, '')) <> ''`,
    [platform, userIds]
  );

  const grouped = new Map();
  rows.forEach((row) => {
    const key = row.user_id;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({
      username: normalizeSocialUsername(row.username),
      accountOrder: Number(row.account_order) || 1,
    });
  });
  return grouped;
}

export function getUsernamesForPlatform(user, platform, socialMap = new Map()) {
  const primaryField = platform === "instagram" ? "insta" : "tiktok";
  const secondaryField = platform === "instagram" ? "insta_2" : "tiktok_2";
  const usernames = new Set();

  const add = (value) => {
    const normalized = normalizeSocialUsername(value);
    if (normalized) usernames.add(normalized);
  };

  add(user?.[primaryField]);

  if (isMultiSocialMatchingEnabled()) {
    add(user?.[secondaryField]);
  }

  const mapped = socialMap.get(user?.user_id) || [];
  if (isMultiSocialMatchingEnabled()) {
    mapped.forEach((row) => add(row.username));
  } else if (isSocialFallbackEnabled()) {
    if (!usernames.size) {
      const primary = mapped.find((row) => row.accountOrder === 1) || mapped[0];
      if (primary) add(primary.username);
    }
  }

  return usernames;
}

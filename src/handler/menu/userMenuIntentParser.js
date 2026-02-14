const affirmativeWords = new Set(["ya", "iya", "y", "ok", "oke"]);
const negativeWords = new Set(["tidak", "ga", "gak", "n"]);

export const normalizeUserMenuText = (text = "") => text.trim().toLowerCase();

export const parseAffirmativeNegativeIntent = (text = "") => {
  const normalized = normalizeUserMenuText(text);

  if (!normalized) {
    return null;
  }

  if (affirmativeWords.has(normalized)) {
    return "affirmative";
  }

  if (negativeWords.has(normalized)) {
    return "negative";
  }

  return null;
};

export const parseNumericOptionIntent = (text = "", maxOption = 0) => {
  const normalized = normalizeUserMenuText(text);

  if (!normalized) {
    return null;
  }

  let parsed = null;

  if (/^\d+$/.test(normalized)) {
    parsed = Number.parseInt(normalized, 10);
  } else {
    const numericTokens = normalized.match(/\d+/g) || [];
    if (numericTokens.length !== 1) {
      return null;
    }
    parsed = Number.parseInt(numericTokens[0], 10);
  }

  if (parsed < 1 || parsed > maxOption) {
    return null;
  }

  return parsed;
};

export const isDebouncedRepeatedInput = (session, step, text, debounceMs = 2500) => {
  const normalized = normalizeUserMenuText(text);
  if (!session || !normalized) {
    return false;
  }

  const now = Date.now();
  const previous = session.lastInvalidInputMeta;
  session.lastInvalidInputMeta = {
    step,
    normalized,
    at: now,
  };

  return (
    previous?.step === step &&
    previous?.normalized === normalized &&
    now - previous.at <= debounceMs
  );
};

export const getIntentParserHint = ({ step, example }) =>
  [
    "❌ Input tidak sesuai langkah saat ini.",
    `🧭 Menu aktif saat ini: *${step}*`,
    `💬 Contoh jawaban: *${example}*`,
  ].join("\n");

export const userMenuIntentSynonyms = {
  affirmative: [...affirmativeWords],
  negative: [...negativeWords],
};

const affirmativeWords = new Set(["ya", "iya", "y", "ok", "oke"]);
const negativeWords = new Set(["tidak", "ga", "gak", "n"]);

const normalizeUserMenuToken = (token = "") =>
  token
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "")
    .replace(/[^\p{L}\p{N}_-]/gu, "");

export const normalizeUserMenuText = (text = "") =>
  text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !((code >= 0 && code <= 31) || code === 127);
    })
    .join("")
    .trim()
    .toLowerCase();

export const parseAffirmativeNegativeIntent = (text = "") => {
  const normalized = normalizeUserMenuText(text);

  if (!normalized) {
    return null;
  }

  const tokens = normalized
    .split(/\s+/)
    .map(normalizeUserMenuToken)
    .filter(Boolean);

  if (!tokens.length) {
    return null;
  }

  const lastToken = tokens[tokens.length - 1];
  if (affirmativeWords.has(lastToken)) {
    return "affirmative";
  }

  if (negativeWords.has(lastToken)) {
    return "negative";
  }

  if (tokens.length <= 3) {
    const hasAffirmative = tokens.some((token) => affirmativeWords.has(token));
    const hasNegative = tokens.some((token) => negativeWords.has(token));
    if (hasAffirmative && !hasNegative) {
      return "affirmative";
    }
    if (hasNegative && !hasAffirmative) {
      return "negative";
    }
  }

  return null;
};

const dedupeNumericValues = (values = []) => [...new Set(values)];

export const parseNumericSelectionIntent = (
  text = "",
  maxOption = 0,
  { allowBatch = false } = {}
) => {
  const normalized = normalizeUserMenuText(text);

  if (!normalized) {
    return { type: "empty" };
  }

  const numericTokens = normalized.match(/\d+/g) || [];
  if (!numericTokens.length) {
    return { type: "invalid" };
  }

  const parsed = dedupeNumericValues(
    numericTokens.map((token) => Number.parseInt(token, 10))
  ).filter((value) => Number.isFinite(value));

  if (!parsed.length) {
    return { type: "invalid" };
  }

  const hasOutOfRange = parsed.some((value) => value < 1 || value > maxOption);
  if (hasOutOfRange) {
    return { type: "out_of_range", values: parsed };
  }

  if (parsed.length > 1) {
    if (!allowBatch) {
      return { type: "multi_not_supported", values: parsed };
    }
    return { type: "multi", values: parsed };
  }

  return { type: "single", value: parsed[0], values: parsed };
};

export const parseNumericOptionIntent = (text = "", maxOption = 0) => {
  const intent = parseNumericSelectionIntent(text, maxOption);
  if (intent.type !== "single") {
    return null;
  }
  return intent.value;
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

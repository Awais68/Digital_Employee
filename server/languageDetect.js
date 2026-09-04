// Deterministic language detection for the chatbot's reply-language rule.
//
// The system prompt alone was not enough: it is written mostly in Roman Urdu,
// which biases smaller models (gpt-4o-mini via OpenRouter) into answering English
// questions in Roman Urdu. So the language is decided here in code and injected
// as an explicit, unambiguous directive right before the model answers.

// Script ranges checked in order — first hit wins.
const SCRIPTS = [
  { name: "Urdu",       label: "Urdu (Arabic script)",    re: /[؀-ۿݐ-ݿ]/ },
  { name: "Hindi",      label: "Hindi (Devanagari)",      re: /[ऀ-ॿ]/ },
  { name: "Bengali",    label: "Bengali",                 re: /[ঀ-৿]/ },
  { name: "Chinese",    label: "Chinese",                 re: /[一-鿿]/ },
  { name: "Japanese",   label: "Japanese",                re: /[぀-ヿ]/ },
  { name: "Korean",     label: "Korean",                  re: /[가-힯]/ },
  { name: "Russian",    label: "Russian (Cyrillic)",      re: /[Ѐ-ӿ]/ },
];

// Urdu vs Arabic share a script. These letters exist in Urdu/Perso-Arabic but
// not in standard Arabic — most decisively ی (U+06CC) and ک (U+06A9), which
// Arabic writes as ي and ك.
const URDU_SCRIPT_MARKERS = /[\u0679\u0688\u0691\u06BE\u06C1\u06C3\u06D2\u067E\u0686\u0698\u06AF\u06CC\u06A9]/;

// High-signal Roman Urdu tokens. Deliberately excludes words that are also
// common English ("main", "so", "he", "to", "din") to avoid false positives.
const ROMAN_URDU_WORDS = new Set([
  "kya","kia","kyu","kyun","kyon","kaise","kese","kaisay","kaun","kon","kaunsi","konsi","kaunsa",
  "hai","hain","tha","thi","thay","hua","hui","hue","hoga","hogi","raha","rahi","rahe","gaya","gayi",
  "karo","kro","kar","kardo","krdo","karna","krna","karke","kiya","kiye","karta","karti",
  "mujhe","mujhy","tum","tumhe","aap","apko","aapko","mera","meri","mere","tera","teri","hamara",
  "batao","btao","bata","dekho","dekhna","dikhao","bhejo","bhej","bhejna","lao","chahiye","chahiyay",
  "nahi","nai","nahin","haan","han","ji","acha","achha","theek","thik","sahi","zara","abhi",
  "kuch","koi","sab","sabhi","phir","fir","lekin","magar","agar","warna","aur","ya","bhi",
  "pe","pr","par","se","ko","ka","ki","ke","mein","mai","men","wala","wali","wale",
  "kaam","kam","baat","baat","din","kal","aaj","subah","raat","waqt","banao","bana","banado",
]);

// High-signal English function words. Same design as ROMAN_URDU_WORDS: only
// tokens that do NOT appear in Roman Urdu, so the two sets never both fire on
// the same word.
const ENGLISH_WORDS = new Set([
  "the","a","an","is","are","was","were","be","been","does","did",
  "what","which","who","whom","whose","when","where","why","how",
  "i","you","he","she","we","they","him","her","us","them",
  "my","your","his","their","our","its",
  "and","but","then","than","that","this","these","those",
  "of","for","with","from","about","into","over","after","before","between",
  "not","can","could","should","would","will","shall","may","might","must",
  "have","has","had","get","got","make","made",
  "show","tell","give","need","want","please","also","just","again","there","here",
]);

function detectLanguage(text) {
  const raw = (text || "").trim();
  if (!raw) return { code: "en", label: "English", confident: false };

  for (const s of SCRIPTS) {
    if (!s.re.test(raw)) continue;
    if (s.name === "Urdu") {
      return URDU_SCRIPT_MARKERS.test(raw)
        ? { code: "ur", label: "Urdu (Arabic script)", confident: true }
        : { code: "ar", label: "Arabic", confident: true };
    }
    return { code: s.name.toLowerCase().slice(0, 2), label: s.label, confident: true };
  }

  // Latin script — Roman Urdu or English?
  const words = raw.toLowerCase().match(/[a-z']+/g) || [];
  if (!words.length) return { code: "en", label: "English", confident: false };

  const urHits = words.filter((w) => ROMAN_URDU_WORDS.has(w)).length;
  const enHits = words.filter((w) => ENGLISH_WORDS.has(w)).length;

  // Roman Urdu wins on a tie: a message with both ("send email kar do") is a
  // Roman Urdu sentence borrowing English tech nouns, not the reverse.
  // One marker is enough in a short message ("bhejo", "kya hua").
  if (urHits > enHits || (urHits >= 1 && words.length <= 4)) {
    return { code: "ur-Latn", label: "Roman Urdu (Urdu written in Latin letters)", confident: true };
  }
  if (enHits >= 2 || (enHits === 1 && words.length <= 4)) {
    return { code: "en", label: "English", confident: true };
  }
  // Latin script, neither set fired — could be Spanish/French/etc, which are not
  // enumerated. Flag as a guess so the directive falls back to "same language
  // as the user" rather than wrongly asserting English.
  return { code: "en", label: "English", confident: false };
}

function buildLanguageDirective(text) {
  // The owner writes in Roman Urdu but asked for English answers, so mirroring
  // their language is now opt-in. CHATBOT_LANGUAGE=mirror restores the old
  // detect-and-match behaviour; any other value pins that language.
  const forced = (process.env.CHATBOT_LANGUAGE || "English").trim();
  if (forced.toLowerCase() !== "mirror") {
    return [
      "REPLY LANGUAGE (overrides every other instruction):",
      `Write your ENTIRE reply in ${forced} — every sentence, including`,
      "confirmations, error messages and action summaries.",
      "The user may write in Roman Urdu; do NOT mirror it, and do not mix the two.",
      "Never name or announce the language. Just answer in it.",
    ].join("\n");
  }

  const { label, confident } = detectLanguage(text);
  // When detection is only a guess (Latin script, no Roman Urdu markers), do not
  // assert a language — an assertion would override a genuine Spanish/French
  // message. Point the model at the user's own message instead.
  const target = confident
    ? label
    : "the exact same language the user's last message is written in";

  return [
    "REPLY LANGUAGE (overrides every other instruction):",
    confident ? `The user's last message is in ${label}.` : "",
    `Write your ENTIRE reply in ${target} — every sentence, including`,
    "confirmations, error messages and action summaries.",
    "Keep product/tech nouns in English (email, post, todo, draft, LinkedIn, Instagram).",
    "Never name or announce the language. Just answer in it.",
  ]
    .filter(Boolean)
    .join("\n");
}

// Action discipline, injected in the same trailing turn as the language rule.
//
// Smaller models happily write "email bhej diya" ("email sent") while emitting no
// <ACTION> block at all — a plain lie to the user, since nothing ran. The rule
// exists in the main system prompt, but that prompt is long and it gets lost;
// restating it adjacent to the user's turn is what actually holds.
const ACTION_DISCIPLINE = [
  "ACTION DISCIPLINE (never violate):",
  "Nothing happens unless you emit an <ACTION> block. You cannot send email,",
  "publish posts, or create todos by describing them in prose.",
  "- Never claim an action is done ('sent', 'posted', 'added', 'bhej diya',",
  "  'kar diya') in a reply that has no <ACTION> block.",
  "- If you are showing a draft for approval, say what you WILL do and ask,",
  "  in the future/conditional tense. Never the past tense.",
  "- If the user has approved and you are performing it now: one short line,",
  "  then the <ACTION> block. Write nothing after the block.",
].join("\n");

function buildTurnDirective(text) {
  return buildLanguageDirective(text) + "\n\n" + ACTION_DISCIPLINE;
}

module.exports = { detectLanguage, buildLanguageDirective, buildTurnDirective };

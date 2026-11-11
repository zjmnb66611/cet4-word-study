(() => {
  "use strict";

  const SAMPLE_NOTE = "测试数据，非书中内容";
  const INTERVALS = [1, 2, 4, 7, 15];
  const STATUS = Object.freeze({ new: "未学", learning: "学习中", mastered: "已掌握" });
  const EMPTY = Object.freeze({ streak: 0, dueAt: null, inNotebook: false });
  const str = (value) => typeof value === "string" ? value.trim() : "";
  const list = (value) => Array.isArray(value) ? value : [];
  const keyText = (value) => str(value).normalize("NFKC").toLowerCase().replace(/\s+/g, " ");

  function parseLibrary(data) {
    if (!Array.isArray(data)) throw new Error("词库应为 JSON 数组。");
    const usedKeys = new Set();
    const units = new Map();
    const words = data.map((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        throw new Error(`第 ${index + 1} 条词条应为 JSON 对象。`);
      }
      const word = str(row.word);
      const unit = str(row.unit) || "未分单元";
      const page = Number.isInteger(row.page) && row.page > 0 ? row.page : null;
      const id = str(row.id);
      const baseKey = id ? JSON.stringify(["id", id]) : JSON.stringify(["fields", unit, keyText(word), page]);
      let key = baseKey;
      for (let suffix = 2; usedKeys.has(key); suffix++) key = `${baseKey}#${suffix}`;
      usedKeys.add(key);
      const item = {
        key, word, unit, page,
        phonetic: str(row.phonetic),
        posMeanings: list(row.pos_meanings)
          .map((entry) => ({ pos: str(entry?.pos), meaning: str(entry?.meaning) }))
          .filter(({ pos, meaning }) => pos || meaning),
        mnemonic: str(row.mnemonic),
        relatedWords: list(row.related_words).map(str).filter(Boolean),
        examples: list(row.examples)
          .map((entry) => ({ en: str(entry?.en), zh: str(entry?.zh) }))
          .filter(({ en, zh }) => en || zh),
        needsReview: row.needs_review === true,
        note: str(row.note),
      };
      item.searchText = keyText([word, ...item.posMeanings.map(({ meaning }) => meaning)].join(" "));
      if (!units.has(unit)) units.set(unit, []);
      units.get(unit).push(item);
      return item;
    });
    return { words, units, sample: words.length > 0 && words.every(({ note }) => note === SAMPLE_NOTE) };
  }

  function cleanRecord(record) {
    if (!record || typeof record !== "object") return EMPTY;
    const streak = Number.isInteger(record.streak) ? Math.max(0, Math.min(INTERVALS.length, record.streak)) : 0;
    return {
      streak,
      dueAt: Number.isFinite(record.dueAt) && record.dueAt > 0 ? record.dueAt : null,
      inNotebook: record.inNotebook === true,
    };
  }

  function statusOf(record) {
    if (record.streak === INTERVALS.length) return "mastered";
    return record.dueAt === null ? "new" : "learning";
  }

  function recordAnswer(record, known, now = new Date()) {
    const streak = known ? Math.min(record.streak + 1, INTERVALS.length) : 0;
    const due = new Date(now);
    due.setDate(due.getDate() + (known ? INTERVALS[streak - 1] : 1));
    due.setHours(0, 0, 0, 0);
    return {
      streak,
      dueAt: due.getTime(),
      inNotebook: !known || (streak < INTERVALS.length && record.inNotebook),
    };
  }

  function isDue(record, now) {
    return record.dueAt !== null && record.dueAt <= now;
  }

  function shuffled(items) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function buildMeaningQuiz(words, count = 10) {
    const prompts = words.filter(({ word, posMeanings }) => word && posMeanings.some(({ meaning }) => meaning));
    const byMeaning = new Map();
    for (const word of prompts) {
      const first = word.posMeanings.find(({ meaning }) => meaning).meaning;
      const key = keyText(first);
      if (!byMeaning.has(key)) byMeaning.set(key, first);
    }
    const pool = prompts.flatMap((word) => {
      const known = new Set(word.posMeanings.map(({ meaning }) => keyText(meaning)));
      const matching = [...known].filter((key) => byMeaning.has(key)).length;
      const answer = word.posMeanings.find(({ meaning }) => meaning).meaning;
      return matching < byMeaning.size ? [{ word, known, answer }] : [];
    });
    if (!pool.length) return [];
    const meanings = [...byMeaning];
    const questions = [];
    while (questions.length < count) {
      const batch = shuffled(pool);
      if (batch.length > 1 && questions.at(-1)?.word.key === batch[0].word.key) {
        [batch[0], batch[1]] = [batch[1], batch[0]];
      }
      for (const { word, answer, known } of batch.slice(0, count - questions.length)) {
        const distractors = shuffled(meanings).filter(([key]) => !known.has(key)).slice(0, 3);
        questions.push({ word, answer, choices: shuffled([answer, ...distractors.map(([, meaning]) => meaning)]) });
      }
    }
    return questions;
  }

  globalThis.WordStudy = Object.freeze({
    STATUS, EMPTY, keyText, parseLibrary, cleanRecord, statusOf, recordAnswer, isDue, buildMeaningQuiz,
  });
})();


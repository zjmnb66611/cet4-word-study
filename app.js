(() => {
  "use strict";

  const Study = globalThis.WordStudy;
  const screen = document.querySelector("#screen");
  const main = document.querySelector("#main");
  const fileInput = document.querySelector("#library-file");
  const chooseLibrary = document.querySelector("#choose-library");
  const onFileProtocol = location.protocol === "file:";
  let library;
  let records = Object.create(null);
  let storageAvailable = true;
  let storageKey;
  let loadingMessage = "正在读取 words.json…";
  let loadVersion = 0;
  let view = "home";
  let session;
  let quiz;
  let query = "";

  function element(tag, className, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.append(...children);
    return node;
  }

  function button(label, onClick, className = "button") {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function announce(message) {
    document.querySelector("#announcement").textContent = message;
  }

  function readRecords() {
    const data = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return Object.assign(Object.create(null), data && typeof data === "object" ? data : {});
  }

  function loadRecords() {
    records = Object.create(null);
    storageAvailable = true;
    try {
      records = readRecords();
    } catch {
      storageAvailable = false;
    }
    document.querySelector("#storage-warning").hidden = storageAvailable;
  }

  function recordFor(word) {
    return Study.cleanRecord(records[word.key]);
  }

  function updateRecord(word, change) {
    try {
      if (storageAvailable) records = readRecords();
    } catch {
      storageAvailable = false;
    }
    records[word.key] = change(recordFor(word));
    try {
      if (storageAvailable) localStorage.setItem(storageKey, JSON.stringify(records));
    } catch {
      storageAvailable = false;
    }
    document.querySelector("#storage-warning").hidden = storageAvailable;
  }

  function loadLibrary(data, filename) {
    library = Study.parseLibrary(data);
    storageKey = `cet4-word-study-v1:${library.sample ? "sample" : "book"}`;
    loadRecords();
    const banner = document.querySelector("#library-banner");
    banner.hidden = !library.sample;
    banner.className = "sample-banner";
    banner.replaceChildren(element("span", "sample-dot"), "当前为测试词库 · 非书中内容");
    document.querySelector("#library-source").textContent = `词库文件 · ${filename}`;
    navigate("home");
  }

  async function fetchLibrary() {
    const version = ++loadVersion;
    try {
      const response = await fetch("words.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`无法读取 words.json（HTTP ${response.status}）。`);
      const data = await response.json();
      if (version === loadVersion) loadLibrary(data, "words.json");
    } catch (error) {
      if (version !== loadVersion) return;
      loadingMessage = error instanceof SyntaxError ? "words.json 的 JSON 格式有误。" : error.message;
      render();
    }
  }

  chooseLibrary.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    const version = ++loadVersion;
    try {
      const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      if (version === loadVersion) loadLibrary(data, file.name);
    } catch (error) {
      if (version !== loadVersion) return;
      loadingMessage = error instanceof SyntaxError ? "这个文件的 JSON 格式有误，请检查后重新选择。" : error.message;
      if (library) {
        const warning = element("p", "notice", loadingMessage);
        warning.setAttribute("role", "alert");
        screen.querySelector(".notice")?.remove();
        screen.prepend(warning);
      } else {
        render();
      }
    }
  });

  function navigate(next, focus = true) {
    view = next;
    render();
    if (!focus) return;
    window.scrollTo(0, 0);
    const target = next === "search" && library ? document.querySelector("#word-search") : main;
    target.focus({ preventScroll: true });
  }

  document.querySelectorAll("[data-view]").forEach((control) => {
    control.addEventListener("click", () => {
      if (control.dataset.view === "quiz") quiz = null;
      navigate(control.dataset.view);
    });
  });

  function render() {
    document.querySelectorAll(".navigation [data-view]").forEach((control) => {
      if (control.dataset.view === view) control.setAttribute("aria-current", "page");
      else control.removeAttribute("aria-current");
    });
    if (!library) {
      const panel = emptyState("载入词库", loadingMessage);
      panel.append(button("选择 words.json", () => fileInput.click(), "button primary"));
      screen.replaceChildren(panel);
      return;
    }
    const pages = {
      home: renderHome,
      study: renderStudy,
      notebook: renderNotebook,
      search: renderSearch,
      review: renderReview,
      quiz: renderQuiz,
    };
    screen.replaceChildren(pages[view]());
  }

  function heading(title, description = "") {
    const head = element("div", "section-heading", element("h1", "", title));
    if (description) head.append(element("p", "muted", description));
    return head;
  }

  function emptyState(title, description) {
    return element("section", "empty panel", element("h2", "", title), element("p", "muted", description));
  }

  function pageDescription(word) {
    return word.page ? `${word.unit} · 第 ${word.page} 页` : word.unit;
  }

  function notebookWords() {
    return library.words.filter((word) => recordFor(word).inNotebook);
  }

  function dueWords() {
    const now = Date.now();
    return library.words.filter((word) => Study.isDue(recordFor(word), now))
      .sort((a, b) => recordFor(a).dueAt - recordFor(b).dueAt);
  }

  function unitProgress(words) {
    const counts = { mastered: 0, learning: 0, new: 0 };
    for (const word of words) counts[Study.statusOf(recordFor(word))]++;
    const keys = Object.keys(counts);
    const progress = element("div", "unit-progress");
    progress.setAttribute("aria-hidden", "true");
    for (const key of keys) {
      const segment = element("span", `segment ${key}`);
      segment.style.flexGrow = counts[key];
      if (counts[key]) progress.append(segment);
    }
    const legend = element("div", "legend", ...keys.map((key) =>
      element("span", "", element("i", key), Study.STATUS[key], element("b", "", String(counts[key])))));
    return [progress, legend];
  }

  function renderHome() {
    const due = dueWords();
    const hero = element("section", "hero",
      element("div", "hero-content",
        element("h1", "", "今日复习"),
        element("p", "hero-count", element("strong", "", String(due.length)), " 个单词待复习"),
        button(due.length ? "开始复习 →" : "查看今日复习 →", () => startStudy(dueWords(), "今日复习", "home"), "button hero-button")),
      element("div", "hero-art",
        element("span", "orbit orbit-outer"),
        element("span", "orbit orbit-inner"),
        element("span", "card-shadow"),
        element("span", "card-art", element("i"), element("i"), element("i"))));
    hero.querySelector(".hero-art").setAttribute("aria-hidden", "true");
    const units = element("section", "units");
    units.append(element("div", "units-header",
      element("h2", "", "按单元学习"),
      element("span", "muted", `${library.units.size} 个单元 · ${library.words.length} 个词条`)));
    const grid = element("div", "unit-grid");
    for (const [unit, words] of library.units) {
      grid.append(element("article", "unit-card panel",
        element("div", "unit-top",
          element("div", "", element("h3", "", unit), element("p", "muted", `${words.length} 个词条`)),
          button("学习 →", () => startStudy(words, unit, "home"), "button unit-button")),
        ...unitProgress(words)));
    }
    units.append(grid.childElementCount ? grid : emptyState("词库为空", "向 words.json 添加词条后，这里会自动显示单元。"));
    return element("div", "stack", hero, units);
  }

  function startStudy(words, title, from, interactive = true) {
    session = { words, title, from, interactive, index: 0, revealed: !interactive, known: 0 };
    navigate("study");
  }

  function displayWord(word) {
    return word.word || "未填写单词";
  }

  function speak(word) {
    if (!word.word || !("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      announce("此词条或当前浏览器无法朗读。");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(word.word);
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(({ lang, localService }) => localService && /^en[-_]/i.test(lang)) ||
      voices.find(({ lang }) => /^en[-_]/i.test(lang));
    utterance.lang = voice?.lang || "en-US";
    if (voice) utterance.voice = voice;
    utterance.onerror = ({ error }) => {
      if (error !== "interrupted" && error !== "canceled") announce("当前设备无法播放英语语音。");
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  function definitionBlock(word) {
    const block = element("section", "definitions", element("h3", "", "词性释义"));
    if (!word.posMeanings.length) block.append(element("p", "muted", "词库未提供释义。"));
    for (const { pos, meaning } of word.posMeanings) {
      const row = element("div", "meaning-row");
      if (pos) row.append(element("span", "part-of-speech", pos));
      if (meaning) row.append(element("span", "", meaning));
      block.append(row);
    }
    return block;
  }

  function wordDetails(word) {
    const details = element("div", "word-details", definitionBlock(word));
    details.append(element("section", "mnemonic",
      element("h3", "", "巧记"),
      element("p", word.mnemonic ? "verbatim" : "muted", word.mnemonic || "词库未提供巧记。")));
    if (word.relatedWords.length) {
      details.append(element("section", "",
        element("h3", "", "关联词"),
        element("div", "chips", ...word.relatedWords.map((related) => element("span", "chip", related)))));
    }
    if (word.examples.length) {
      const examples = element("section", "examples", element("h3", "", "例句"));
      for (const { en, zh } of word.examples) {
        const row = element("div", "example");
        if (en) {
          const english = element("p", "verbatim", en);
          english.lang = "en";
          row.append(english);
        }
        if (zh) row.append(element("p", "muted verbatim", zh));
        examples.append(row);
      }
      details.append(examples);
    }
    if (word.note) details.append(element("p", "word-note verbatim", word.note));
    return details;
  }

  function wordCard(word) {
    const card = element("article", `flashcard panel${session.revealed ? " revealed" : ""}`);
    const name = element("h2", "big-word", displayWord(word));
    if (word.word) name.lang = "en";
    const flip = button(session.revealed ? "返回正面" : "翻面查看释义", flipCard, "button flip-button");
    flip.dataset.flip = "";
    flip.setAttribute("aria-expanded", String(session.revealed));
    flip.setAttribute("aria-controls", "flashcard-details");
    const top = element("div", "card-front", name);
    if (word.phonetic) top.append(element("p", "phonetic", word.phonetic));
    if (word.word && "speechSynthesis" in window) {
      top.append(button("发音", () => speak(word), "button sound-button"));
    }
    card.append(element("div", "card-meta", element("span", "", pageDescription(word)),
      notebookButton(word, true)), top, flip);
    const details = element("div");
    details.id = "flashcard-details";
    details.hidden = !session.revealed;
    if (session.revealed) details.append(wordDetails(word));
    card.append(details);
    card.addEventListener("click", (event) => {
      if (!session.revealed && !event.target.closest("button") && !window.getSelection()?.toString()) flipCard();
    });
    return card;
  }

  function flipCard() {
    session.revealed = !session.revealed;
    render();
    screen.querySelector("[data-flip]")?.focus({ preventScroll: true });
  }

  function answerStudy(known) {
    const word = session?.interactive && session.words[session.index];
    if (!word || view !== "study") return;
    updateRecord(word, (record) => Study.recordAnswer(record, known));
    if (known) session.known++;
    session.index++;
    session.revealed = false;
    navigate("study");
  }

  function attachSwipe(card) {
    let start;
    card.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1 || event.target.closest("button")) {
        start = null;
        return;
      }
      const { clientX: x, clientY: y } = event.touches[0];
      start = { x, y };
    }, { passive: true });
    card.addEventListener("touchend", (event) => {
      if (!start) return;
      const { clientX: x, clientY: y } = event.changedTouches[0];
      const horizontal = x - start.x;
      const vertical = y - start.y;
      start = null;
      if (Math.abs(horizontal) >= 65 && Math.abs(horizontal) > Math.abs(vertical) * 1.5) {
        answerStudy(horizontal > 0);
      }
    }, { passive: true });
    card.addEventListener("touchcancel", () => { start = null; }, { passive: true });
  }

  function renderStudy() {
    const word = session.words[session.index];
    const back = button("← 返回", () => navigate(session.from), "button back-button");
    const panel = element("div", "study-layout",
      element("div", "mode-top", back, element("h1", "", session.title)));
    if (!word) {
      const complete = session.words.length > 0;
      const message = complete ? `认识 ${session.known} 个 · 不认识 ${session.words.length - session.known} 个`
        : "今天没有到期的单词。";
      panel.append(emptyState(complete ? "本轮结束" : "暂无到期词", message));
      return panel;
    }
    if (session.interactive) {
      const meter = element("progress", "study-progress");
      meter.max = session.words.length;
      meter.value = session.index + 1;
      meter.setAttribute("aria-label", "学习进度");
      panel.append(element("div", "study-meter", meter,
        element("span", "muted", `${session.index + 1} / ${session.words.length}`)));
    }
    const card = wordCard(word);
    panel.append(card);
    if (session.interactive) {
      attachSwipe(card);
      panel.append(element("div", "answer-controls",
        button("← 不认识", () => answerStudy(false), "button unknown"),
        button("认识 →", () => answerStudy(true), "button primary")),
        element("p", "gesture-hint muted", "左滑或 ← 不认识 · 右滑或 → 认识"));
    }
    return panel;
  }

  document.addEventListener("keydown", (event) => {
    if (view !== "study" || !session?.interactive || event.repeat || event.altKey || event.ctrlKey ||
        event.metaKey || event.shiftKey || event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (window.getSelection()?.toString()) return;
    event.preventDefault();
    answerStudy(event.key === "ArrowRight");
  });

  function notebookButton(word, onCard = false) {
    const inNotebook = recordFor(word).inNotebook;
    const control = button(inNotebook ? "移出生词本" : "加生词本", () => {
      updateRecord(word, (record) => ({ ...record, inNotebook: !record.inNotebook }));
      const added = recordFor(word).inNotebook;
      announce(added ? "已加入生词本" : "已移出生词本");
      if (view === "notebook") {
        render();
        main.focus({ preventScroll: true });
      } else {
        const replacement = notebookButton(word, onCard);
        control.replaceWith(replacement);
        replacement.focus({ preventScroll: true });
      }
    }, onCard ? "button quiet notebook-control" : "button small");
    control.setAttribute("aria-label", `${control.textContent}：${displayWord(word)}`);
    return control;
  }

  function listing(words, from, showNote = false) {
    return element("ul", "word-list", ...words.map((word) => {
      const open = button(displayWord(word), () => startStudy([word], "词条详情", from, false), "word-link");
      if (word.word) open.lang = "en";
      const meanings = word.posMeanings.map(({ pos, meaning }) => [pos, meaning].filter(Boolean).join(" ")).join("；");
      const body = element("div", "list-word", open,
        element("p", "list-meaning", meanings || "词库未提供释义。"),
        element("p", "muted list-meta", pageDescription(word)));
      if (showNote) body.append(element("p", "word-note verbatim", word.note || "未填写备注。"));
      const controls = element("div", "list-actions", notebookButton(word));
      if (from === "notebook") {
        controls.prepend(button("单独复习", () => startStudy([word], "生词复习", from), "button small primary"));
      }
      return element("li", "panel list-row", body, controls);
    }));
  }

  function renderNotebook() {
    const words = notebookWords();
    const page = element("div", "stack", heading("生词本", `${words.length} 个词条`));
    if (!words.length) {
      page.append(emptyState("生词本为空", "答错、点「不认识」，或在词条旁点「加生词本」后，词条会出现在这里。"));
    } else {
      page.append(element("div", "", button("复习全部生词 →", () => startStudy(notebookWords(), "生词复习", "notebook"), "button primary")),
        listing(words, "notebook"));
    }
    return page;
  }

  function renderSearch() {
    const input = element("input", "search-input");
    input.id = "word-search";
    input.type = "search";
    input.placeholder = "输入英文单词或中文释义";
    input.setAttribute("aria-label", input.placeholder);
    input.autocomplete = "off";
    input.value = query;
    const results = element("div", "stack search-results");
    const count = element("p", "muted result-count");
    count.setAttribute("role", "status");
    const matches = element("div");
    const batchSize = 50;
    function showResults() {
      query = input.value;
      const term = Study.keyText(query);
      const found = term ? library.words.filter(({ searchText }) => searchText.includes(term)) : [];
      count.textContent = term ? `找到 ${found.length} 个词条` : "";
      matches.replaceChildren();
      if (!term) return;
      if (!found.length) {
        matches.append(emptyState("没有匹配词条", "试试单词的一部分或更短的中文关键词。"));
        return;
      }
      let shown = 0;
      const more = button("显示更多", () => {
        const previous = shown;
        showBatch();
        matches.querySelectorAll(".word-link")[previous]?.focus({ preventScroll: true });
      }, "button more-button");
      function showBatch() {
        more.remove();
        matches.append(listing(found.slice(shown, shown + batchSize), "search"));
        shown += batchSize;
        if (shown < found.length) matches.append(more);
      }
      showBatch();
    }
    input.addEventListener("input", showResults);
    results.append(count, matches);
    showResults();
    return element("div", "stack", heading("搜索"), input, results);
  }

  function renderReview() {
    const words = library.words.filter(({ needsReview }) => needsReview);
    return element("div", "stack", heading("核对词条", `${words.length} 条词条标记为待核对`),
      words.length ? listing(words, "review", true) : emptyState("暂无待核对词条", "词库中标为待核对的词条及其备注会显示在这里。"));
  }

  function startQuiz() {
    const questions = Study.buildMeaningQuiz(library.words);
    quiz = { questions, index: 0, responses: [] };
    navigate("quiz");
  }

  function answerQuiz(choice) {
    if (quiz.responses.length !== quiz.index) return;
    const question = quiz.questions[quiz.index];
    if (!question) return;
    const correct = choice === question.answer;
    quiz.responses.push({ ...question, choice, correct });
    if (!correct) updateRecord(question.word, (record) => Study.recordAnswer(record, false));
    render();
    screen.querySelector(".quiz-feedback")?.focus({ preventScroll: true });
  }

  function renderQuiz() {
    const page = element("div", "study-layout", heading("选择题测试"));
    if (!quiz) {
      page.append(element("section", "panel quiz-intro",
        element("h2", "", "看英文，选中文释义"),
        element("p", "muted", "每轮 10 题。答错的词会加入生词本，并安排到明天复习。"),
        button("开始测试 →", startQuiz, "button primary")));
      return page;
    }
    if (!quiz.questions.length) {
      page.append(emptyState("词库暂时无法出题", "至少需要两个带有不同中文释义的有效词条。"));
      return page;
    }
    const question = quiz.questions[quiz.index];
    if (!question) {
      const correct = quiz.responses.filter((response) => response.correct).length;
      const mistakes = [...new Map(quiz.responses.filter((response) => !response.correct)
        .map(({ word }) => [word.key, word])).values()];
      page.append(element("section", "panel quiz-intro",
        element("h2", "", "测试结果"),
        element("p", "score", `${Math.round(correct / quiz.questions.length * 100)}%`),
        element("p", "muted", `答对 ${correct} / ${quiz.questions.length} 题`),
        button("再测一轮", startQuiz, "button primary")));
      if (mistakes.length) page.append(element("h2", "", "做错的词"), listing(mistakes, "quiz"));
      else page.append(element("p", "muted", "本轮全部答对。"));
      return page;
    }
    const response = quiz.responses[quiz.index];
    const prompt = element("h2", "big-word", displayWord(question.word));
    prompt.lang = "en";
    const card = element("section", "panel quiz-card",
      element("p", "muted", `第 ${quiz.index + 1} / ${quiz.questions.length} 题`), prompt);
    const options = element("div", "quiz-options");
    for (const choice of question.choices) {
      const correctChoice = response && choice === question.answer;
      const incorrectChoice = response && choice === response.choice && !response.correct;
      const label = correctChoice ? `${choice}（正确选项）` : incorrectChoice ? `${choice}（你的选择）` : choice;
      const option = button(label, () => answerQuiz(choice),
        `button quiz-option${correctChoice ? " correct" : ""}${incorrectChoice ? " incorrect" : ""}`);
      option.disabled = Boolean(response);
      options.append(option);
    }
    card.append(options);
    if (response) {
      const feedback = element("p", `quiz-feedback ${response.correct ? "right" : "wrong"}`,
        response.correct ? "回答正确" : "回答错误，已加入生词本");
      feedback.tabIndex = -1;
      const next = button(quiz.index + 1 === quiz.questions.length ? "查看结果 →" : "下一题 →", () => {
        quiz.index++;
        navigate("quiz");
      }, "button primary");
      card.append(feedback, next);
    }
    page.append(card);
    return page;
  }

  window.addEventListener("storage", (event) => {
    if (!library || (event.key !== null && event.key !== storageKey)) return;
    loadRecords();
    if (view === "home") render();
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && view === "home" && library) render();
  });

  if (onFileProtocol) loadingMessage = "请选择同目录的 words.json。通过本地服务器打开时，网站会自动读取该文件。";
  render();
  if (!onFileProtocol) fetchLibrary();
})();


const byId = (id) => document.getElementById(id);
const game = byId("game");
const play = byId("play");
const cards = byId("cards");
const listen = byId("listen");
const hint = byId("hint");
const prompt = byId("prompt");
const audioStatus = byId("audio-status");
const feedback = byId("feedback");
const next = byId("next");
const summary = byId("summary");
const summaryTitle = byId("summary-title");
const continueButton = byId("continue");

const ROUND_SIZE = 10;
let wasm;
let poems;
let reading;
let finished;

const poemArt = (index) => `./art/${String(index + 1).padStart(3, "0")}.webp`;

function verse() {
  return document.querySelector('input[name="verse"]:checked').value;
}

function showKanji() {
  return document.querySelector('input[name="script"]:checked').value === "kanji";
}

function refreshText() {
  const lower = verse() === "lower";
  const kanji = showKanji();
  byId("instruction").textContent = lower
    ? "かみのくを きいて、つづく しものくを とろう"
    : "かみのくを きいて、おなじ ふだを とろう";
  prompt.textContent = poems[wasm.game_answer()][kanji ? 0 : 2];
  const column = (kanji ? 0 : 2) + Number(lower);
  for (const [index, card] of Array.from(cards.children).entries()) {
    const text = card.querySelector(".card-text");
    text.replaceChildren(...poems[wasm.game_choice(index)][column].split("　").map((phrase) => {
      const line = document.createElement("span");
      line.textContent = phrase;
      return line;
    }));
  }
}

function showHint(visible) {
  prompt.hidden = !visible;
  hint.setAttribute("aria-expanded", String(visible));
  hint.textContent = visible ? "もじを かくす" : "もじで みる";
}

function stopReading() {
  reading = undefined;
  window.speechSynthesis?.cancel();
}

function audioUnavailable() {
  audioStatus.textContent = "おとが でないときは、もじで みてね。";
  showHint(true);
}

function readAloud() {
  const synth = window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance) {
    audioUnavailable();
    return;
  }
  stopReading();
  audioStatus.textContent = "";
  const spoken = poems[wasm.game_answer()][2].replaceAll("　", "、");
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.lang = "ja-JP";
  const voice = synth.getVoices().find((item) => /^ja(?:[-_]|$)/i.test(item.lang));
  if (voice) utterance.voice = voice;
  utterance.rate = 0.78;
  utterance.onerror = () => {
    if (reading === utterance) {
      reading = undefined;
      audioUnavailable();
    }
  };
  utterance.onend = () => {
    if (reading === utterance) reading = undefined;
  };
  reading = utterance;
  synth.speak(utterance);
}

function updateStars() {
  byId("stars").textContent = `★ ${wasm.game_stars()}`;
}

function chooseCard(index, card) {
  const result = wasm.game_choose(index);
  if (result === 0) return;
  const mark = card.querySelector(".card-mark");
  card.setAttribute("aria-disabled", "true");
  mark.hidden = false;
  if (result === 1) {
    card.classList.add("wrong");
    mark.textContent = "ちがう";
    feedback.textContent = "おしい！ もういちど えらぼう。";
    return;
  }
  card.classList.add("correct");
  mark.textContent = "せいかい！";
  feedback.textContent = "やったね！ ふだが とれたよ。";
  for (const option of cards.children) {
    option.setAttribute("aria-disabled", "true");
  }
  updateStars();
  next.hidden = false;
  next.focus();
}

function renderQuestion(focus = true) {
  const position = wasm.game_position();
  const round = Math.floor(position / ROUND_SIZE) + 1;
  const question = position % ROUND_SIZE;
  byId("progress-text").textContent = `第${round}セット ・ ${question + 1} / ${ROUND_SIZE}もん`;
  byId("progress-dots").replaceChildren(...Array.from({ length: ROUND_SIZE }, (_, index) => {
    const dot = document.createElement("i");
    if (index < question) dot.className = "done";
    if (index === question) dot.className = "active";
    return dot;
  }));
  updateStars();
  cards.replaceChildren(...Array.from({ length: 3 }, (_, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    const art = document.createElement("img");
    art.className = "card-art";
    art.alt = "";
    art.width = 224;
    art.height = 224;
    art.draggable = false;
    art.src = poemArt(wasm.game_choice(index));
    const text = document.createElement("span");
    text.className = "card-text";
    const mark = document.createElement("span");
    mark.className = "card-mark";
    mark.hidden = true;
    card.append(art, text, mark);
    card.addEventListener("click", () => chooseCard(index, card));
    return card;
  }));
  refreshText();
  feedback.textContent = "";
  audioStatus.textContent = "";
  showHint(false);
  next.hidden = true;
  summary.hidden = true;
  play.hidden = false;
  if (focus) listen.focus();
}

function newDeck() {
  wasm.game_start(crypto.getRandomValues(new Uint32Array(1))[0]);
  finished = false;
}

next.addEventListener("click", () => {
  const stars = wasm.game_stars();
  const step = wasm.game_advance();
  if (!step) return;
  stopReading();
  if (step === 1) {
    renderQuestion();
    return;
  }
  finished = step === 3;
  summaryTitle.textContent = finished ? "ぜんぶで 100しゅ、とれたよ！" : "10まい とれたよ！";
  byId("summary-detail").textContent = `いちどで とれた ふだは ★ ${stars}まい！`;
  continueButton.textContent = finished ? "もういちど あそぶ" : "つぎの 10もん";
  play.hidden = true;
  summary.hidden = false;
  summaryTitle.focus();
});

continueButton.addEventListener("click", () => {
  if (finished) newDeck();
  renderQuestion();
});
listen.addEventListener("click", readAloud);
hint.addEventListener("click", () => showHint(prompt.hidden));
document.querySelector(".settings").addEventListener("change", refreshText);

try {
  const response = await fetch("./hundred_waka.wasm");
  if (!response.ok) throw new Error(`WASM: ${response.status}`);
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer());
  wasm = instance.exports;
  poems = readRows(wasm.poems_ptr(), wasm.poems_len());
  setupCatalog(readRows(wasm.catalog_ptr(), wasm.catalog_len()));
  newDeck();
  renderQuestion(false);
  byId("loading").hidden = true;
  byId("views").hidden = false;
  game.hidden = false;
} catch (error) {
  console.error(error);
  byId("loading").textContent = "ゲームを ひらけなかったよ。ページを もういちど ひらいてね。";
}

function readRows(pointer, length) {
  const bytes = new Uint8Array(wasm.memory.buffer, pointer, length);
  return new TextDecoder().decode(bytes).trimEnd().split("\n").map((line) => line.split("\t"));
}

function setupCatalog(entries) {
  const catalog = byId("catalog");
  const showGame = byId("show-game");
  const showCatalog = byId("show-catalog");
  const search = byId("catalog-search");
  const picker = byId("catalog-entry");
  const previous = byId("catalog-prev");
  const following = byId("catalog-next");
  const detail = byId("catalog-detail");
  const art = byId("catalog-art");
  const creditedPortraits = new Set([1, 2, 7, 9, 24, 57, 62, 86, 97]);
  let matches = [];
  let selected = 0;

  function normalize(value) {
    return value.normalize("NFKC").replace(/\s+/gu, "")
      .replace(/[ァ-ヶ]/gu, (letter) => String.fromCharCode(letter.charCodeAt(0) - 0x60));
  }

  const searchText = entries.map(([name, reading, , profile], index) => (
    normalize([name, reading, ...poems[index], profile].join(" "))
  ));

  function renderEntry() {
    const position = matches.indexOf(selected);
    detail.hidden = position < 0;
    previous.disabled = position <= 0;
    following.disabled = position < 0 || position === matches.length - 1;
    if (position < 0) return;

    picker.value = String(selected);
    const [name, reading, portrait, profile, meaning] = entries[selected];
    const poemMode = document.querySelector('input[name="catalog-mode"]:checked').value === "poem";
    const pronunciation = document.createElement("rt");
    pronunciation.textContent = reading;
    byId("catalog-name").replaceChildren(document.createTextNode(name), pronunciation);
    art.src = poemMode ? poemArt(selected) : `./portraits/${portrait}.webp`;
    byId("catalog-caption").textContent = poemMode ? "うたの じょうけい"
      : creditedPortraits.has(selected + 1) ? "歌人の イメージ"
      : "時代や くらしの イメージ";
    const verse = byId("catalog-verse");
    verse.hidden = !poemMode;
    verse.textContent = poems[selected].slice(0, 2).join("\n");
    byId("catalog-kana").hidden = !poemMode;
    byId("catalog-reading").textContent = poems[selected].slice(2).join("\n");
    byId("catalog-description").textContent = poemMode ? meaning : profile;
  }

  function filterEntries() {
    const query = normalize(search.value);
    const number = /^[0-9]+$/.test(query) ? Number(query) : null;
    matches = searchText.flatMap((contents, index) => {
      const match = number === null ? contents.includes(query) : number === index + 1;
      return match ? [index] : [];
    });
    if (!matches.includes(selected)) selected = matches[0] ?? selected;
    picker.replaceChildren(...matches.map((index) => {
      const item = document.createElement("option");
      item.value = String(index);
      item.textContent = `${index + 1}ばん　${entries[index][0]}`;
      return item;
    }));
    picker.disabled = matches.length === 0;
    byId("catalog-count").textContent = matches.length ? `${matches.length}けん` : "みつからなかったよ。";
    renderEntry();
  }

  function openCatalog(open) {
    game.hidden = open;
    catalog.hidden = !open;
    showCatalog.setAttribute("aria-pressed", String(open));
    showGame.setAttribute("aria-pressed", String(!open));
    if (open) {
      stopReading();
      renderEntry();
    }
  }

  function move(offset) {
    const index = matches[matches.indexOf(selected) + offset];
    if (index === undefined) return;
    selected = index;
    renderEntry();
  }

  showCatalog.addEventListener("click", () => openCatalog(true));
  showGame.addEventListener("click", () => openCatalog(false));
  search.addEventListener("input", filterEntries);
  picker.addEventListener("change", () => {
    selected = Number(picker.value);
    renderEntry();
  });
  catalog.querySelector(".catalog-modes").addEventListener("change", renderEntry);
  previous.addEventListener("click", () => move(-1));
  following.addEventListener("click", () => move(1));
  filterEntries();
}

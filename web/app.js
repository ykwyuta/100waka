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
    const text = document.createElement("span");
    text.className = "card-text";
    const mark = document.createElement("span");
    mark.className = "card-mark";
    mark.hidden = true;
    card.append(text, mark);
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
  const buffer = new Uint8Array(wasm.memory.buffer, wasm.poems_ptr(), wasm.poems_len());
  poems = new TextDecoder().decode(buffer).trimEnd().split("\n").map((line) => line.split("\t"));
  newDeck();
  renderQuestion(false);
  byId("loading").hidden = true;
  game.hidden = false;
} catch (error) {
  console.error(error);
  byId("loading").textContent = "ゲームを ひらけなかったよ。ページを もういちど ひらいてね。";
}

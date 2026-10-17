'use strict';

const CHARACTERS = ['ayaka', 'ayato', 'itto', 'kazuha', 'kokomi', 'raiden', 'sara', 'yae'];
const CARD_BACK = 'assets/card_face/cardface.png';
const cardArt = (name) => `assets/card_inside/${name}.png`;
const label = (name) => name.charAt(0).toUpperCase() + name.slice(1);

// Preload every image so cards don't flicker the first time they flip.
[CARD_BACK, ...CHARACTERS.map(cardArt)].forEach((src) => { new Image().src = src; });
const GAME_SECONDS = 90;
const BASE_POINTS = 100;
const MAX_SPEED_BONUS = 100;  // for a pair found instantly; drops by 10 per second
const MAX_MULTIPLIER = 3;
const STORAGE_KEY = 'memoryArcade.top5';
const ROUND_BONUS_SECONDS = 30;  // added to the clock whenever a board is cleared
const AUDIO_DIR = 'assets/audio';

const makeAudio = (file, volume) => {
  const audio = new Audio(`${AUDIO_DIR}/${file}`);
  audio.preload = 'auto';
  audio.volume = volume;
  return audio;
};
const sounds = {
  bgm: makeAudio('bgm.mp3', 0.35),
  click: makeAudio('clicksfx.mp3', 0.7),
  match: makeAudio('correctmatchsfx.mp3', 0.8),
  gameover: makeAudio('gameoversfx.mp3', 0.9),
};
sounds.bgm.loop = true;

// Play a copy so quick repeats overlap instead of cutting each other off.
function playSfx(sound) {
  const copy = sound.cloneNode();
  copy.volume = sound.volume;
  copy.play().catch(() => {});
}

const $ = (id) => document.getElementById(id);
const ui = {
  board: $('board'), score: $('score'), round: $('round'), finalRound: $('final-round'), streak: $('streak'), time: $('time'), message: $('message'),
  overlay: $('overlay'), startPanel: $('start-panel'), overPanel: $('over-panel'),
  startBtn: $('start-btn'), finalScore: $('final-score'), form: $('initials-form'),
  initials: $('initials'), scores: $('scores'), again: $('play-again'),
};

const newGame = () => ({ round: 1, score: 0, run: 0, matched: 0, first: null, busy: false, over: true, last: 0, end: 0, timer: null });
let game = newGame();

const multiplier = () => Math.min(MAX_MULTIPLIER, 1 + game.run);
const say = (text) => { ui.message.textContent = text; };

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function buildBoard() {
  ui.board.replaceChildren();
  shuffle([...CHARACTERS, ...CHARACTERS]).forEach((name) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.dataset.character = name;
    card.setAttribute('aria-label', 'Face-down card');
    card.innerHTML = `<span class="card-inner">
      <span class="face back"><img src="${CARD_BACK}" alt="" draggable="false"></span>
      <span class="face front"><img src="${cardArt(name)}" alt="" draggable="false"></span>
    </span>`;
    card.addEventListener('click', () => flip(card));
    ui.board.append(card);
  });
}

function renderHud() {
  ui.score.textContent = game.score.toLocaleString();
  ui.round.textContent = game.round;
  ui.streak.textContent = `${multiplier()}x`;
  ui.streak.parentElement.classList.toggle('hot', game.run > 0);
}

function showPanel(name) {
  ui.overlay.hidden = !name;
  ui.startPanel.hidden = name !== 'start';
  ui.overPanel.hidden = name !== 'over';
}

function startGame() {
  game = newGame();
  game.over = false;
  game.last = performance.now();
  game.end = Date.now() + GAME_SECONDS * 1000;
  buildBoard();
  renderHud();
  showPanel(null);
  say('Find the matching pairs.');
  sounds.bgm.currentTime = 0;
  sounds.bgm.play().catch(() => {});
  game.timer = setInterval(tick, 200);
  tick();
}

function tick() {
  const left = Math.max(0, Math.ceil((game.end - Date.now()) / 1000));
  ui.time.textContent = left;
  ui.time.parentElement.classList.toggle('urgent', left <= 10 && left > 0);
  if (left === 0) endGame();
}

function flashBonus() {
  const stat = ui.time.parentElement;
  stat.classList.add('bonus');
  setTimeout(() => stat.classList.remove('bonus'), 1000);
}

function flip(card) {
  if (game.over || game.busy || card.classList.contains('flipped') || card.classList.contains('matched')) return;
  playSfx(sounds.click);
  card.classList.add('flipped');
  card.setAttribute('aria-label', label(card.dataset.character));
  if (!game.first) { game.first = card; return; }

  const a = game.first, b = card;
  game.first = null;
  game.busy = true;
  a.dataset.character === b.dataset.character ? match(a, b) : miss(a, b);
}

function match(a, b) {
  const g = game;
  const seconds = (performance.now() - g.last) / 1000;  // time since the previous pair was resolved
  const bonus = Math.max(0, MAX_SPEED_BONUS - Math.floor(seconds * 10));
  const mult = multiplier();
  const points = (BASE_POINTS + bonus) * mult;

  g.score += points;
  g.run++;
  g.matched++;
  g.last = performance.now();
  [a, b].forEach((c) => c.classList.add('matched'));
  playSfx(sounds.match);
  say(`+${points}  (${BASE_POINTS} base + ${bonus} speed) × ${mult}`);
  renderHud();

  if (g.matched === CHARACTERS.length) {
    const cleared = g.round;
    g.round++;
    g.end += ROUND_BONUS_SECONDS * 1000;
    say(`Round ${cleared} cleared! +${ROUND_BONUS_SECONDS} seconds`);
    renderHud();
    tick();
    flashBonus();
    setTimeout(() => {
      if (g !== game || g.over) return;
      g.matched = 0;
      buildBoard();
      g.last = performance.now();
      g.busy = false;
    }, 1200);
  } else {
    g.busy = false;
  }
}

function miss(a, b) {
  const g = game;
  g.run = 0;
  [a, b].forEach((c) => c.classList.add('wrong'));
  say('No match. Streak reset to 1x.');
  renderHud();
  setTimeout(() => {
    [a, b].forEach((c) => {
      c.classList.remove('flipped', 'wrong');
      c.setAttribute('aria-label', 'Face-down card');
    });
    if (g !== game) return;
    g.last = performance.now();
    g.busy = false;
  }, 750);
}

/* ---------- Leaderboard ---------- */

function loadScores() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

function saveScore(entry) {
  const top5 = [...loadScores(), entry].sort((x, y) => y.score - x.score).slice(0, 5);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(top5)); } catch { /* storage unavailable */ }
  return top5;
}

function renderScores(list, highlightId) {
  // Fills every leaderboard on the page (side box and Game Over screen).
  document.querySelectorAll('.scores').forEach((ol) => {
    ol.replaceChildren();
    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No scores yet. Yours could be first.';
      ol.append(li);
      return;
    }
    list.forEach((entry, i) => {
      const li = document.createElement('li');
      if (entry.id === highlightId) li.className = 'me';
      li.innerHTML = '<span class="rank"></span><span class="who"></span><span class="pts"></span>';
      li.children[0].textContent = i + 1;
      li.children[1].textContent = entry.name;
      li.children[2].textContent = entry.score.toLocaleString();
      ol.append(li);
    });
  });
}

function endGame() {
  if (game.over) return;
  game.over = true;
  clearInterval(game.timer);
  sounds.bgm.pause();
  playSfx(sounds.gameover);
  ui.time.textContent = 0;
  ui.time.parentElement.classList.remove('urgent');
  ui.finalScore.textContent = game.score.toLocaleString();
  ui.finalRound.textContent = game.round;
  ui.initials.value = '';
  ui.form.hidden = false;
  ui.again.hidden = true;
  renderScores(loadScores());
  say('');
  showPanel('over');
  ui.initials.focus();
}

ui.initials.addEventListener('input', () => {
  ui.initials.value = ui.initials.value.replace(/[^a-z0-9]/gi, '').toUpperCase();
});

ui.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const entry = { name: ui.initials.value || '???', score: game.score, id: Date.now() };
  renderScores(saveScore(entry), entry.id);
  ui.form.hidden = true;
  ui.again.hidden = false;
  ui.again.focus();
});

ui.startBtn.addEventListener('click', startGame);
ui.again.addEventListener('click', startGame);

// "How to play" numbers come from the constants at the top of this file.
const fills = { start: GAME_SECONDS, bonus: ROUND_BONUS_SECONDS };
document.querySelectorAll('[data-fill]').forEach((el) => { el.textContent = fills[el.dataset.fill]; });

// Keep the leaderboard current if scores change in another tab.
window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) renderScores(loadScores()); });

buildBoard();
renderHud();
renderScores(loadScores());
showPanel('start');
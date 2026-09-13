(() => {
  "use strict";

  const STORAGE_KEY = "wuffel-dice-v1";
  const DEFAULT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const COLOR_PALETTE = [
    "#7c3aed", "#ec4899", "#f59e0b", "#10b981",
    "#3b82f6", "#ef4444", "#14b8a6", "#8b5cf6"
  ];

  const TYPE_LABELS = {
    d4: "W4", d6: "W6", d8: "W8", d10: "W10", d12: "W12", d20: "W20",
    custom: "Zahl", letters: "ABC"
  };

  const MUTE_KEY = "wuffel-muted";

  const diceContainer = document.getElementById("dice-container");
  const dieTemplate = document.getElementById("die-template");
  const settingsItemTemplate = document.getElementById("settings-item-template");
  const toastEl = document.getElementById("toast");
  const muteBtn = document.getElementById("mute-btn");
  const sumDisplayEl = document.getElementById("sum-display");
  const sumValueEl = document.getElementById("sum-value");
  const presetSelect = document.getElementById("preset-select");
  const settingsBtn = document.getElementById("settings-btn");
  const settingsOverlay = document.getElementById("settings-overlay");
  const settingsCloseBtn = document.getElementById("settings-close-btn");
  const settingsListEl = document.getElementById("settings-list");
  const removeDieBtn = document.getElementById("remove-die-btn");
  const diceCountEl = document.getElementById("dice-count");

  let colorCursor = 0;
  let dice = loadDice();
  let toastTimer = null;
  let muted = localStorage.getItem(MUTE_KEY) === "1";
  let audioCtx = null;

  function ensureAudioCtx() {
    if (muted) return null;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  // Caps overlapping clicks/thuds when several dice roll at once so it
  // doesn't turn into a wall of noise with 5+ dice.
  const TICK_MIN_GAP = 55;
  const LAND_MIN_GAP = 45;
  let lastTickAt = 0;
  let lastLandAt = 0;

  function playTick() {
    const now = performance.now();
    if (now - lastTickAt < TICK_MIN_GAP) return false;
    const ctx = ensureAudioCtx();
    if (!ctx) return false;
    lastTickAt = now;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 160 + Math.random() * 140;
    gain.gain.setValueAtTime(0.09, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.045);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
    return true;
  }

  function playLand() {
    const now = performance.now();
    if (now - lastLandAt < LAND_MIN_GAP) return false;
    const ctx = ensureAudioCtx();
    if (!ctx) return false;
    lastLandAt = now;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.13);
    gain.gain.setValueAtTime(0.17, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
    return true;
  }

  function updateMuteBtn() {
    muteBtn.textContent = muted ? "🔇" : "🔊";
  }
  updateMuteBtn();

  muteBtn.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    updateMuteBtn();
    if (!muted) ensureAudioCtx();
  });

  function vibrate(pattern) {
    if (muted) return;
    if (typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // ignore – vibration not supported/allowed
      }
    }
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function defaultDie(overrides = {}) {
    return {
      id: uid(),
      type: "d6",
      min: 1,
      max: 6,
      letters: DEFAULT_LETTERS,
      color: nextColor(),
      value: null,
      ...overrides
    };
  }

  function nextColor() {
    const c = COLOR_PALETTE[colorCursor % COLOR_PALETTE.length];
    colorCursor++;
    return c;
  }

  function loadDice() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [defaultDie()];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return [defaultDie()];
      return parsed.map((d) => ({ ...defaultDie(), ...d, value: null }));
    } catch (e) {
      return [defaultDie()];
    }
  }

  function saveDice() {
    const toSave = dice.map(({ id, type, min, max, letters, color }) => ({
      id, type, min, max, letters, color
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }

  function faceValuesPool(die) {
    switch (die.type) {
      case "d4": return range(1, 4);
      case "d6": return range(1, 6);
      case "d8": return range(1, 8);
      case "d10": return range(1, 10);
      case "d12": return range(1, 12);
      case "d20": return range(1, 20);
      case "custom": {
        const min = Number.isFinite(die.min) ? die.min : 1;
        const max = Number.isFinite(die.max) ? die.max : 6;
        const lo = Math.min(min, max);
        const hi = Math.max(min, max);
        return range(lo, hi);
      }
      case "letters": {
        const letters = (die.letters || "").split("").filter((c) => /\S/.test(c));
        return letters.length ? letters : ["A"];
      }
      default: return range(1, 6);
    }
  }

  function range(lo, hi) {
    const arr = [];
    for (let i = lo; i <= hi; i++) arr.push(i);
    return arr;
  }

  function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function renderAll() {
    diceContainer.innerHTML = "";
    dice.forEach((die) => diceContainer.appendChild(buildDieCard(die)));
    updateRemoveDieBtn();
    updateSumDisplay();
  }

  function updateSumDisplay() {
    const numericDice = dice.filter((d) => d.type !== "letters");
    if (numericDice.length < 2) {
      sumDisplayEl.hidden = true;
      return;
    }
    const sum = numericDice.reduce((total, d) => total + (typeof d.value === "number" ? d.value : 0), 0);
    sumValueEl.textContent = sum;
    sumDisplayEl.hidden = false;
  }

  function updateRemoveDieBtn() {
    removeDieBtn.disabled = dice.length <= 1;
    diceCountEl.textContent = dice.length;
  }

  function buildDieCard(die) {
    const node = dieTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.id = die.id;

    const face = node.querySelector(".die-face");
    face.style.setProperty("--die-color", die.color);

    const label = node.querySelector(".die-type-label");
    label.textContent = TYPE_LABELS[die.type] || "?";

    face.addEventListener("click", () => rollDie(die.id));

    updateFaceDisplay(node, die);
    return node;
  }

  function refreshDieCard(die) {
    const node = diceContainer.querySelector(`.die-card[data-id="${die.id}"]`);
    if (!node) return;
    node.querySelector(".die-face").style.setProperty("--die-color", die.color);
    node.querySelector(".die-type-label").textContent = TYPE_LABELS[die.type] || "?";
    updateFaceDisplay(node, die);
  }

  function renderSettingsList() {
    settingsListEl.innerHTML = "";
    dice.forEach((die, index) => settingsListEl.appendChild(buildSettingsItem(die, index)));
  }

  function buildSettingsItem(die, index) {
    const node = settingsItemTemplate.content.firstElementChild.cloneNode(true);

    const swatch = node.querySelector(".settings-item-swatch");
    const title = node.querySelector(".settings-item-title");
    const badge = node.querySelector(".settings-item-badge");
    const typeSelect = node.querySelector(".cfg-type");
    const minInput = node.querySelector(".cfg-min");
    const maxInput = node.querySelector(".cfg-max");
    const lettersArea = node.querySelector(".cfg-letters");
    const colorInput = node.querySelector(".cfg-color");
    const customRows = node.querySelectorAll(".cfg-row-custom");
    const lettersRow = node.querySelector(".cfg-row-letters");
    const presetsEl = node.querySelector(".color-presets");

    function applyItemColor(color) {
      node.style.setProperty("--item-color", color);
      swatch.style.background = color;
      presetsEl.querySelectorAll(".color-preset-btn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.color === color);
      });
    }

    COLOR_PALETTE.forEach((color) => {
      const swatchBtn = document.createElement("button");
      swatchBtn.type = "button";
      swatchBtn.className = "color-preset-btn";
      swatchBtn.style.background = color;
      swatchBtn.dataset.color = color;
      swatchBtn.setAttribute("aria-label", `Farbe ${color}`);
      swatchBtn.addEventListener("click", () => {
        die.color = color;
        colorInput.value = color;
        applyItemColor(color);
        refreshDieCard(die);
        saveDice();
      });
      presetsEl.appendChild(swatchBtn);
    });

    title.textContent = `Würfel ${index + 1}`;
    badge.textContent = TYPE_LABELS[die.type] || "?";
    typeSelect.value = die.type;
    minInput.value = die.min;
    maxInput.value = die.max;
    lettersArea.value = die.letters;
    colorInput.value = die.color;
    applyItemColor(die.color);

    function syncVisibility() {
      const isCustom = typeSelect.value === "custom";
      const isLetters = typeSelect.value === "letters";
      customRows.forEach((r) => (r.hidden = !isCustom));
      lettersRow.hidden = !isLetters;
    }
    syncVisibility();

    typeSelect.addEventListener("change", () => {
      die.type = typeSelect.value;
      badge.textContent = TYPE_LABELS[die.type] || "?";
      syncVisibility();
      die.value = null;
      refreshDieCard(die);
      updateSumDisplay();
      saveDice();
    });

    minInput.addEventListener("change", () => {
      die.min = parseInt(minInput.value, 10) || 0;
      die.value = null;
      refreshDieCard(die);
      saveDice();
    });

    maxInput.addEventListener("change", () => {
      die.max = parseInt(maxInput.value, 10) || 0;
      die.value = null;
      refreshDieCard(die);
      saveDice();
    });

    lettersArea.addEventListener("input", () => {
      die.letters = lettersArea.value.toUpperCase();
      die.value = null;
      refreshDieCard(die);
    });
    lettersArea.addEventListener("change", () => {
      lettersArea.value = lettersArea.value.toUpperCase();
      saveDice();
    });

    colorInput.addEventListener("input", () => {
      die.color = colorInput.value;
      applyItemColor(die.color);
      refreshDieCard(die);
      saveDice();
    });

    return node;
  }

  function openSettings() {
    renderSettingsList();
    settingsOverlay.hidden = false;
  }

  function closeSettings() {
    settingsOverlay.hidden = true;
  }

  settingsBtn.addEventListener("click", openSettings);
  settingsCloseBtn.addEventListener("click", closeSettings);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsOverlay.hidden) closeSettings();
  });

  function updateFaceDisplay(node, die) {
    const inner = node.querySelector(".die-face-inner");
    inner.innerHTML = "";

    if (die.type === "d6") {
      const grid = document.createElement("div");
      grid.className = "pip-grid";
      const pattern = PIP_PATTERNS[die.value] || PIP_PATTERNS[null];
      pattern.forEach((filled) => {
        const pip = document.createElement("div");
        pip.className = "pip" + (filled ? "" : " empty");
        grid.appendChild(pip);
      });
      inner.appendChild(grid);
    } else {
      const span = document.createElement("span");
      span.className = "face-number" + (die.type === "letters" ? " is-letter" : "");
      span.textContent = die.value === null || die.value === undefined ? "?" : die.value;
      inner.appendChild(span);
    }
  }

  // 3x3 grid, true = pip visible, for values 1-6 and null (idle state shows single center pip)
  const PIP_PATTERNS = {
    null: [0,0,0, 0,1,0, 0,0,0],
    1: [0,0,0, 0,1,0, 0,0,0],
    2: [1,0,0, 0,0,0, 0,0,1],
    3: [1,0,0, 0,1,0, 0,0,1],
    4: [1,0,1, 0,0,0, 1,0,1],
    5: [1,0,1, 0,1,0, 1,0,1],
    6: [1,0,1, 1,0,1, 1,0,1]
  };

  const rollingIds = new Set();

  function rollDie(id, { silent = false } = {}) {
    if (rollingIds.has(id)) return;
    const die = dice.find((d) => d.id === id);
    if (!die) return;
    const node = diceContainer.querySelector(`.die-card[data-id="${id}"]`);
    if (!node) return;
    const face = node.querySelector(".die-face");
    const pool = faceValuesPool(die);
    if (pool.length === 0) return;

    rollingIds.add(id);
    face.classList.remove("just-landed");
    face.classList.add("is-rolling");

    const duration = 550 + Math.floor(Math.random() * 250);
    const intervalMs = 60;
    const startTime = performance.now();

    const cycle = setInterval(() => {
      die.value = randomFrom(pool);
      updateFaceDisplay(node, die);
      updateSumDisplay();
      if (playTick()) vibrate(12);
      if (performance.now() - startTime >= duration) {
        clearInterval(cycle);
        die.value = randomFrom(pool);
        updateFaceDisplay(node, die);
        updateSumDisplay();
        face.classList.remove("is-rolling");
        face.classList.add("just-landed");
        if (playLand()) vibrate(35);
        rollingIds.delete(id);
        if (!silent) saveDice();
      }
    }, intervalMs);
  }

  function rollAll() {
    dice.forEach((die, i) => {
      setTimeout(() => rollDie(die.id), i * 90);
    });
  }

  function addDie() {
    const prev = dice[dice.length - 1];
    const die = defaultDie(
      prev ? { type: prev.type, min: prev.min, max: prev.max, letters: prev.letters } : {}
    );
    dice.push(die);
    diceContainer.appendChild(buildDieCard(die));
    updateRemoveDieBtn();
    updateSumDisplay();
    saveDice();
    showToast("Würfel hinzugefügt");
  }

  function removeLastDie() {
    if (dice.length <= 1) return;
    const last = dice[dice.length - 1];
    const node = diceContainer.querySelector(`.die-card[data-id="${last.id}"]`);
    dice = dice.filter((d) => d.id !== last.id);
    saveDice();
    updateRemoveDieBtn();
    updateSumDisplay();
    if (node) {
      node.classList.add("removing");
      node.addEventListener("animationend", () => node.remove(), { once: true });
    }
  }

  const PRESETS = {
    w6x1: [{ type: "d6" }],
    w6x2: [{ type: "d6" }, { type: "d6" }],
    kniffel: [{ type: "d6" }, { type: "d6" }, { type: "d6" }, { type: "d6" }, { type: "d6" }],
    slf: [{ type: "letters" }]
  };

  function applyPreset(key) {
    const preset = PRESETS[key];
    if (!preset) return;
    colorCursor = 0;
    dice = preset.map((cfg) => defaultDie(cfg));
    saveDice();
    renderAll();
    showToast("Vorlage geladen");
  }

  function resetAll() {
    dice = [defaultDie()];
    colorCursor = 0;
    saveDice();
    renderAll();
    showToast("Zurückgesetzt");
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1600);
  }

  document.getElementById("roll-all-btn").addEventListener("click", rollAll);
  document.getElementById("add-die-btn").addEventListener("click", addDie);
  removeDieBtn.addEventListener("click", removeLastDie);
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("Wirklich alle Würfel entfernen und zurücksetzen?")) resetAll();
  });
  presetSelect.addEventListener("change", () => {
    applyPreset(presetSelect.value);
    presetSelect.value = "";
  });

  renderAll();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    });
  }
})();

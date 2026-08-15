(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const setupScreen = $("#setup-screen");
  const gameScreen = $("#game-screen");
  const setupForm = $("#setup-form");
  const durationInput = $("#duration");
  const durationOutput = $("#duration-output");
  const intensityInput = $("#intensity");
  const intensityOutput = $("#intensity-output");
  const playersInput = $("#players");
  const bottleButton = $("#bottle-button");
  const bottle = $(".bottle");
  const spinInstruction = $("#spin-instruction");
  const choicePanel = $("#choice-panel");
  const promptCard = $("#prompt-card");
  const timerEl = $("#timer");
  const promptCountEl = $("#prompt-count");
  const endDialog = $("#end-dialog");

  const state = {
    players: 2,
    durationMinutes: 45,
    maxIntensity: 80,
    startedAt: 0,
    extraTimeMs: 0,
    usedIds: new Set(),
    recentCategories: [],
    rotation: 0,
    spinning: false,
    timerId: null
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function setPlayers(value) {
    playersInput.value = clamp(Number(value) || 2, 2, 20);
  }

  durationInput.addEventListener("input", () => {
    durationOutput.value = `${durationInput.value} min`;
  });
  intensityInput.addEventListener("input", () => {
    intensityOutput.value = `${intensityInput.value} / 100`;
  });
  $("#players-down").addEventListener("click", () => setPlayers(Number(playersInput.value) - 1));
  $("#players-up").addEventListener("click", () => setPlayers(Number(playersInput.value) + 1));
  playersInput.addEventListener("change", () => setPlayers(playersInput.value));

  setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.players = clamp(Number(playersInput.value), 2, 20);
    state.durationMinutes = Number(durationInput.value);
    state.maxIntensity = Number(intensityInput.value);
    state.startedAt = Date.now();
    state.extraTimeMs = 0;
    state.usedIds.clear();
    state.recentCategories = [];
    setupScreen.hidden = true;
    gameScreen.hidden = false;
    resetRound();
    updateTimer();
    state.timerId = window.setInterval(updateTimer, 1000);
  });

  function elapsedRatio() {
    const durationMs = state.durationMinutes * 60_000 + state.extraTimeMs;
    return clamp((Date.now() - state.startedAt) / durationMs, 0, 1);
  }

  // A smoothstep curve has no discrete levels and eases into the bolder prompts.
  function targetIntensity() {
    const t = elapsedRatio();
    const smooth = t * t * (3 - 2 * t);
    const startingIntensity = Math.min(10, state.maxIntensity * 0.35);
    return startingIntensity + (state.maxIntensity - startingIntensity) * smooth;
  }

  function weightedPrompt(type) {
    let eligible = window.PROMPTS.filter((prompt) =>
      prompt.type === type &&
      prompt.minPlayers <= state.players &&
      prompt.intensity <= state.maxIntensity &&
      !state.usedIds.has(prompt.id)
    );

    if (!eligible.length) return null;

    const target = targetIntensity();
    const spread = 16;
    const weighted = eligible.map((prompt) => {
      const distance = prompt.intensity - target;
      const proximity = Math.exp(-(distance * distance) / (2 * spread * spread));
      const variety = state.recentCategories.includes(prompt.category) ? 0.58 : 1;
      const exploration = 0.045;
      return { prompt, weight: (proximity + exploration) * variety };
    });

    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) return item.prompt;
    }
    return weighted.at(-1).prompt;
  }

  function everyoneDrinksPrompt(cardNumber) {
    return {
      id: `m${String(cardNumber).padStart(3, "0")}`,
      type: "everyone drinks",
      category: "milestone",
      intensity: 1,
      minPlayers: 2,
      text: "Everyone drinks! Take one agreed-upon sip/skip together."
    };
  }

  bottleButton.addEventListener("click", () => {
    if (state.spinning) return;
    state.spinning = true;
    bottleButton.disabled = true;
    choicePanel.hidden = true;
    spinInstruction.hidden = false;
    spinInstruction.textContent = "Spinning…";
    bottleButton.classList.add("spinning");

    const turns = 4 + Math.floor(Math.random() * 4);
    const direction = Math.random() * 360;
    state.rotation += turns * 360 + direction;
    bottle.style.transition = "transform 2.8s cubic-bezier(.12,.72,.16,1)";
    bottle.style.transform = `rotate(${state.rotation}deg)`;

    window.setTimeout(() => {
      bottleButton.classList.remove("spinning");
      spinInstruction.textContent = "The bottle has chosen…";
      window.setTimeout(() => {
        state.spinning = false;
        spinInstruction.hidden = true;
        choicePanel.hidden = false;
        choicePanel.querySelector("button").focus();
      }, 800);
    }, 2800);
  });

  document.querySelectorAll(".choice").forEach((button) => {
    button.addEventListener("click", () => showPrompt(button.dataset.type));
  });

  function showPrompt(type) {
    const cardNumber = state.usedIds.size + 1;
    const isEveryoneDrinksCard = cardNumber % 10 === 0;
    const wildcardTriggered = !isEveryoneDrinksCard && Math.random() < 0.05;
    const prompt = isEveryoneDrinksCard
      ? everyoneDrinksPrompt(cardNumber)
      : wildcardTriggered
        ? (weightedPrompt("wildcard") || weightedPrompt(type))
        : weightedPrompt(type);
    if (!prompt) {
      $("#prompt-type").textContent = "All done";
      $("#prompt-category").textContent = type;
      $("#prompt-id").textContent = "debug: none";
      $("#prompt-text").textContent = `You have used every eligible ${type}. Pick the other option or start a new game.`;
    } else {
      state.usedIds.add(prompt.id);
      state.recentCategories = [prompt.category, ...state.recentCategories].slice(0, 3);
      $("#prompt-type").textContent = prompt.type;
      $("#prompt-category").textContent = prompt.category;
      $("#prompt-id").textContent = `debug: ${prompt.id}`;
      $("#prompt-text").textContent = prompt.text;
      promptCountEl.textContent = `${state.usedIds.size} asked`;
    }
    promptCard.classList.toggle("wildcard-card", prompt?.type === "wildcard");
    promptCard.classList.toggle("everyone-drinks-card", prompt?.type === "everyone drinks");
    $("#spin-stage").hidden = true;
    promptCard.hidden = false;
    $("#next-round").focus();
  }

  function resetRound() {
    promptCard.hidden = true;
    $("#spin-stage").hidden = false;
    choicePanel.hidden = true;
    spinInstruction.hidden = false;
    spinInstruction.textContent = "Tap the bottle to spin";
    bottleButton.disabled = false;
    bottleButton.focus();
  }

  $("#next-round").addEventListener("click", resetRound);

  function updateTimer() {
    const durationMs = state.durationMinutes * 60_000 + state.extraTimeMs;
    const remaining = Math.max(0, durationMs - (Date.now() - state.startedAt));
    const minutes = Math.floor(remaining / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000);
    timerEl.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    if (remaining === 0 && !endDialog.open) showEndDialog();
  }

  function showEndDialog() {
    $("#end-summary").textContent = `You made it through ${state.usedIds.size} prompt${state.usedIds.size === 1 ? "" : "s"}.`;
    endDialog.showModal();
  }

  $("#end-game").addEventListener("click", showEndDialog);
  $("#keep-playing").addEventListener("click", () => {
    state.extraTimeMs += 15 * 60_000;
    endDialog.close();
    updateTimer();
  });
  $("#new-game").addEventListener("click", () => {
    window.clearInterval(state.timerId);
    endDialog.close();
    gameScreen.hidden = true;
    setupScreen.hidden = false;
    setupForm.querySelector("button[type='submit']").focus();
  });
})();

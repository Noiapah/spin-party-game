(() => {
  "use strict";

  // Small helper for selecting the first element that matches a CSS selector.
  const $ = (selector) => document.querySelector(selector);

  // Cache frequently used page elements so they do not need to be queried again.
  const setupScreen = $("#setup-screen");
  const gameScreen = $("#game-screen");
  const setupForm = $("#setup-form");
  const durationInput = $("#duration");
  const durationOutput = $("#duration-output");
  const playersInput = $("#players");
  const bottleButton = $("#bottle-button");
  const bottle = $(".bottle");
  const spinInstruction = $("#spin-instruction");
  const choicePanel = $("#choice-panel");
  const promptCard = $("#prompt-card");
  const timerEl = $("#timer");
  const promptCountEl = $("#prompt-count");
  const endDialog = $("#end-dialog");

  // All values that change while a game is running live in this object.
  const state = {
    players: 2,
    durationMinutes: 45,
    startedAt: 0,
    extraTimeMs: 0,
    usedIds: new Set(),
    recentCategories: [],
    rotation: 0,
    spinning: false,
    timerId: null
  };

  // Maps the setup slider positions to their labels and game lengths.
  const durationPresets = {
    1: { label: "Brief", minutes: 15 },
    2: { label: "Short", minutes: 30 },
    3: { label: "Medium", minutes: 45 },
    4: { label: "Long", minutes: 60 },
    5: { label: "Marathon", minutes: 120 }
  };

  // Keeps a number inside the supplied minimum and maximum boundaries.
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // Validates and displays the selected number of players.
  function setPlayers(value) {
    playersInput.value = clamp(Number(value) || 2, 2, 20);
  }

  // Updates the duration slider, visible label, and active preset button.
  function setDuration(value) {
    durationInput.value = value;
    const preset = durationPresets[value];
    durationOutput.value = preset.label;
    durationInput.setAttribute("aria-valuetext", preset.label);
    document.querySelectorAll("[data-duration]").forEach((button) => {
      const active = button.dataset.duration === String(value);
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }

  // Keep the duration controls synchronized when either one is changed.
  durationInput.addEventListener("input", () => setDuration(durationInput.value));
  document.querySelectorAll("[data-duration]").forEach((button) => {
    button.addEventListener("click", () => setDuration(button.dataset.duration));
  });
  $("#players-down").addEventListener("click", () => setPlayers(Number(playersInput.value) - 1));
  $("#players-up").addEventListener("click", () => setPlayers(Number(playersInput.value) + 1));
  playersInput.addEventListener("change", () => setPlayers(playersInput.value));

  // Starts a fresh game using the values selected on the setup screen.
  setupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.players = clamp(Number(playersInput.value), 2, 20);
    state.durationMinutes = durationPresets[durationInput.value].minutes;
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

  // Returns game progress as a number from 0 (start) to 1 (finished).
  function elapsedRatio() {
    const durationMs = state.durationMinutes * 60_000 + state.extraTimeMs;
    return clamp((Date.now() - state.startedAt) / durationMs, 0, 1);
  }

  // Calculates the desired question intensity (1-6) from game progress.
  // Smoothstep makes the increase gradual instead of changing in hard jumps.
  function targetIntensity() {
    const t = elapsedRatio();
    const smooth = t * t * (3 - 2 * t);
    return 1 + 5 * smooth;
  }

  // Selects one eligible, unused prompt of the requested type.
  // Truth and dare weights favor the current intensity, while all prompt types
  // discourage recently used categories to keep consecutive cards varied.
  function weightedPrompt(type) {
    const eligible = window.PROMPTS.filter((prompt) =>
      prompt.type === type &&
      prompt.minPlayers <= state.players &&
      !state.usedIds.has(prompt.id)
    );

    if (!eligible.length) return null;

    let weighted;
    if (type === "wildcard") {
      // Wildcards have no intensity, so only category variety affects weight.
      weighted = eligible.map((prompt) => ({
        prompt,
        weight: state.recentCategories.includes(prompt.category) ? 0.58 : 1
      }));
    } else {
      const progress = elapsedRatio();
      const target = targetIntensity();
      // A smaller spread more strongly favors cards near the target intensity.
      const spread = 0.72;
      weighted = eligible.map((prompt) => {
        const variety = state.recentCategories.includes(prompt.category) ? 0.58 : 1;
        const distance = prompt.intensity - target;
        const proximity = Math.exp(-(distance * distance) / (2 * spread * spread));
        // Higher bands fade in continuously. Levels 5–6 are effectively absent early.
        const lateBand = Math.max(0, prompt.intensity - 2);
        const earlyGuard = lateBand === 0
          ? 1
          : Math.pow(Math.max(progress, 0.001), lateBand * 1.15);
        const exploration = 0.008 * Math.pow(Math.max(progress, 0.05), Math.max(0, prompt.intensity - 1));
        return { prompt, weight: (proximity + exploration) * earlyGuard * variety };
      });
    }

    // Perform a weighted random draw from the eligible prompt list.
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) return item.prompt;
    }
    return weighted.at(-1).prompt;
  }

  // Builds the special milestone prompt shown for every tenth card.
  function everyoneDrinksPrompt(cardNumber) {
    return {
      id: `m${String(cardNumber).padStart(3, "0")}`,
      type: "everyone drinks",
      category: "milestone",
      minPlayers: 2,
      text: "Everyone drinks!"
    };
  }

  // Spins the bottle, then reveals the Truth and Dare choice buttons.
  bottleButton.addEventListener("click", () => {
    if (state.spinning) return;
    state.spinning = true;
    bottleButton.disabled = true;
    choicePanel.hidden = true;
    spinInstruction.hidden = false;
    spinInstruction.textContent = "Spinning…";

    // Add full turns plus a random final angle while preserving prior rotation.
    const turns = 4 + Math.floor(Math.random() * 4);
    const direction = Math.random() * 360;
    state.rotation += turns * 360 + direction;
    bottle.style.transition = "transform 2.8s cubic-bezier(.12,.72,.16,1)";
    bottle.style.transform = `rotate(${state.rotation}deg)`;

    window.setTimeout(() => {
      spinInstruction.textContent = "The bottle has chosen…";
      window.setTimeout(() => {
        state.spinning = false;
        spinInstruction.hidden = true;
        choicePanel.hidden = false;
        choicePanel.querySelector("button").focus();
      }, 800);
    }, 2800);
  });

  // Request the prompt type represented by the clicked choice button.
  document.querySelectorAll(".choice").forEach((button) => {
    button.addEventListener("click", () => showPrompt(button.dataset.type));
  });

  // Chooses a prompt, fills the card, and starts its entrance animation.
  function showPrompt(type) {
    const cardNumber = state.usedIds.size + 1;
    const isEveryoneDrinksCard = cardNumber % 10 === 0;

    // Math.random() returns 0-1, so 0.7 gives non-milestone cards a 70% chance
    // to become wildcards. Change 0.7 to 0.05 for a 5% chance, for example.
    const wildcardTriggered = !isEveryoneDrinksCard && Math.random() < 0.1;

    // Milestone cards take priority. If no wildcard is eligible, fall back to
    // the Truth or Dare type that the player originally selected.
    const prompt = isEveryoneDrinksCard
      ? everyoneDrinksPrompt(cardNumber)
      : wildcardTriggered
        ? (weightedPrompt("wildcard") || weightedPrompt(type))
        : weightedPrompt(type);
    if (!prompt) {
      // Explain when every eligible prompt of this type has already been used.
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
    // These type classes choose the card colors and animation direction in CSS.
    promptCard.classList.toggle("wildcard-card", prompt?.type === "wildcard");
    promptCard.classList.toggle("everyone-drinks-card", prompt?.type === "everyone drinks");
    promptCard.classList.remove("card-exit");
    $("#spin-stage").hidden = true;
    promptCard.hidden = false;
    // Restart the entrance animation even when the same card element is reused.
    void promptCard.offsetWidth;
    promptCard.classList.add("card-enter");
    $("#next-round").focus();
  }

  // Restores the bottle screen and controls for the beginning of another round.
  function resetRound() {
    promptCard.classList.remove("card-enter", "card-exit");
    promptCard.hidden = true;
    $("#spin-stage").hidden = false;
    choicePanel.hidden = true;
    spinInstruction.hidden = false;
    spinInstruction.textContent = "Tap the bottle to spin";
    bottleButton.disabled = false;
    bottleButton.focus();
  }

  // Plays the card's type-specific exit animation before resetting the round.
  function exitPrompt() {
    if (promptCard.classList.contains("card-exit")) return;

    const nextRoundButton = $("#next-round");
    nextRoundButton.disabled = true;
    promptCard.classList.remove("card-enter");

    // Skip movement for people who have reduced motion enabled on their device.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      nextRoundButton.disabled = false;
      resetRound();
      return;
    }

    promptCard.classList.add("card-exit");
    promptCard.addEventListener("animationend", () => {
      nextRoundButton.disabled = false;
      resetRound();
    }, { once: true });
  }

  $("#next-round").addEventListener("click", exitPrompt);

  // Recalculates and displays the remaining game time once per second.
  function updateTimer() {
    const durationMs = state.durationMinutes * 60_000 + state.extraTimeMs;
    const remaining = Math.max(0, durationMs - (Date.now() - state.startedAt));
    const minutes = Math.floor(remaining / 60_000);
    const seconds = Math.floor((remaining % 60_000) / 1000);
    timerEl.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
    if (remaining === 0 && !endDialog.open) showEndDialog();
  }

  // Opens the end-of-game dialog and reports how many prompts were completed.
  function showEndDialog() {
    $("#end-summary").textContent = `You made it through ${state.usedIds.size} prompt${state.usedIds.size === 1 ? "" : "s"}.`;
    endDialog.showModal();
  }

  $("#end-game").addEventListener("click", showEndDialog);

  // Extend the current game by 15 minutes without resetting its progress.
  $("#keep-playing").addEventListener("click", () => {
    state.extraTimeMs += 15 * 60_000;
    endDialog.close();
    updateTimer();
  });

  // Stop the current game and return to the setup screen.
  $("#new-game").addEventListener("click", () => {
    window.clearInterval(state.timerId);
    endDialog.close();
    gameScreen.hidden = true;
    setupScreen.hidden = false;
    setupForm.querySelector("button[type='submit']").focus();
  });
})();

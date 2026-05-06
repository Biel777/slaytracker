const state = {
  runs: [],
  metrics: null,
  activeCharacter: "ALL",
  enabled: new Set(["deaths", "floors", "deck", "cards", "economy"]),
  layout: JSON.parse(localStorage.getItem("slaytracker.layout") || "{}"),
  tableSort: {},
};

const widgets = [
  { id: "floorProgress", type: "Linha", title: "Progressao por floor", analysis: "floors", render: renderFloorProgress },
  { id: "deckWinRate", type: "Barras", title: "Tamanho do deck x win rate", analysis: "deck", render: renderDeckWinRate },
  { id: "cardStats", type: "Tabela", title: "Pick rate por carta", analysis: "cards", render: renderCardStats },
  { id: "deathStats", type: "Tabela", title: "Mortes por encontro", analysis: "deaths", render: renderDeathStats },
  { id: "runTable", type: "Tabela", title: "Historico de runs", analysis: "floors", render: renderRunTable },
  { id: "economy", type: "Barras", title: "Ouro, dano e cura", analysis: "economy", render: renderEconomy },
];

const metricOptions = [
  ["runIndex", "Run"],
  ["ascension", "Ascension"],
  ["floor", "Floor alcancado"],
  ["deckSize", "Tamanho do deck"],
  ["win", "Vitoria"],
  ["runTimeMinutes", "Tempo em minutos"],
  ["goldGained", "Ouro ganho"],
  ["goldSpent", "Ouro gasto"],
  ["damageTaken", "Dano recebido"],
  ["hpHealed", "HP curado"],
  ["cardsPicked", "Cartas escolhidas"],
  ["cardsSkipped", "Ofertas puladas"],
  ["relics", "Reliquias"],
  ["potionsUsed", "Pocoes usadas"],
  ["deathEncounter", "Encontro fatal"],
  ["character", "Personagem"],
];

document.addEventListener("DOMContentLoaded", async () => {
  bindNavigation();
  bindUpload();
  bindSettings();
  bindTableSorting();
  hydrateMetricControls();
  restoreTheme();
  await loadStoredData();
  renderAll();
});

function bindNavigation() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
      document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
      button.classList.add("active");
      document.getElementById(button.dataset.view).classList.add("active");
      setTimeout(renderAllCanvases, 30);
    });
  });
}

function bindUpload() {
  document.getElementById("runFiles").addEventListener("change", async (event) => {
    const files = [...event.target.files];
    if (!files.length) return;
    const parsed = await parseFiles(files);
    setRuns(parsed, `${parsed.length} runs importadas de ${files.length} arquivos.`);
  });

  document.getElementById("loadDemo").addEventListener("click", () => {
    setRuns(makeDemoRuns(), "Exemplo carregado com 12 runs sinteticas.");
  });

  document.getElementById("clearData").addEventListener("click", () => {
    state.runs = [];
    state.metrics = null;
    localStorage.removeItem("slaytracker.runs");
    document.getElementById("uploadStatus").textContent = "Dados limpos.";
    renderAll();
  });

  document.getElementById("resetLayout").addEventListener("click", () => {
    state.layout = {};
    localStorage.removeItem("slaytracker.layout");
    renderWidgets();
  });

  document.getElementById("detailSelect").addEventListener("change", renderDetail);
  document.getElementById("addCustomChart").addEventListener("click", addCustomChart);
}

function bindTableSorting() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".sort-button");
    if (!button) return;
    const tableId = button.dataset.tableId;
    const column = Number(button.dataset.column);
    const current = state.tableSort[tableId] || { column: -1, direction: "desc" };
    state.tableSort[tableId] = {
      column,
      direction: current.column === column && current.direction === "desc" ? "asc" : "desc",
    };
    renderAll();
  });
}

function bindSettings() {
  document.getElementById("themeToggle").addEventListener("change", (event) => {
    document.body.classList.toggle("light", !event.target.checked);
    localStorage.setItem("slaytracker.theme", event.target.checked ? "dark" : "light");
    renderAllCanvases();
  });

  document.querySelectorAll(".analysis-toggle").forEach((input) => {
    input.addEventListener("change", () => {
      input.checked ? state.enabled.add(input.value) : state.enabled.delete(input.value);
      renderAll();
    });
  });
}

function restoreTheme() {
  const theme = localStorage.getItem("slaytracker.theme") || "dark";
  document.body.classList.toggle("light", theme === "light");
  document.getElementById("themeToggle").checked = theme !== "light";
}

function hydrateMetricControls() {
  const selects = ["xMetric", "yMetric", "groupMetric"];
  selects.forEach((id) => {
    const select = document.getElementById(id);
    select.innerHTML = metricOptions
      .map(([value, label]) => `<option value="${value}">${label}</option>`)
      .join("");
  });
  document.getElementById("xMetric").value = "floor";
  document.getElementById("yMetric").value = "win";
  document.getElementById("groupMetric").value = "ascension";
}

async function loadStoredData() {
  const stored = localStorage.getItem("slaytracker.runs");
  if (!stored) {
    await loadBundledHistory(false);
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    if (needsCharacterMigration(parsed)) {
      const migrated = await loadBundledHistory(true);
      if (migrated) return;
    }
    setRuns(parsed, "Dataset anterior restaurado.");
  } catch (error) {
    localStorage.removeItem("slaytracker.runs");
    await loadBundledHistory(false);
  }
}

async function loadBundledHistory(forceMessage) {
  try {
    const response = await fetch("data/slay-history.json", { cache: "no-store" });
    if (!response.ok) return false;
    const rawRuns = await response.json();
    const normalized = rawRuns.map((run, index) => normalizeRun(run, `${run.seed || index}.run`, index));
    setRuns(normalized, forceMessage ? "Dataset antigo atualizado com personagens reais." : "Historico local carregado automaticamente.");
    return true;
  } catch (error) {
    return false;
  }
}

function needsCharacterMigration(runs) {
  return !Array.isArray(runs) || runs.length === 0 || runs.some((run) => !run.character || run.character === "UNKNOWN");
}

async function parseFiles(files) {
  const parsed = [];
  for (const file of files) {
    try {
      const raw = await file.text();
      const run = JSON.parse(raw);
      parsed.push(normalizeRun(run, file.name, parsed.length));
    } catch (error) {
      console.warn(`Falha ao importar ${file.name}`, error);
    }
  }
  return parsed.sort((a, b) => a.startTime - b.startTime);
}

function setRuns(runs, message) {
  state.runs = runs.map((run, index) => ({ ...run, runIndex: index + 1 }));
  state.activeCharacter = "ALL";
  updateScopedMetrics();
  localStorage.setItem("slaytracker.runs", JSON.stringify(state.runs));
  document.getElementById("uploadStatus").textContent = message;
  renderAll();
  document.querySelector('[data-view="dashboard"]').click();
}

function updateScopedMetrics() {
  if (!state.runs.length) {
    state.metrics = null;
    return;
  }
  const runs = state.activeCharacter === "ALL" ? state.runs : state.runs.filter((run) => run.character === state.activeCharacter);
  state.metrics = buildMetrics(runs);
}

function normalizeRun(run, fileName = "run.json", fallbackIndex = 0) {
  const floors = flattenFloors(run.map_point_history);
  const players = Array.isArray(run.players) ? run.players : [];
  const firstPlayer = players[0] || {};
  const character = cleanId(firstPlayer.character || run.character || "UNKNOWN");
  const lastStats = [...floors].reverse().flatMap((floor) => floor.playerStats).find(Boolean) || {};
  const cardEvents = collectCardEvents(floors);
  const cardsPicked = cardEvents.filter((event) => event.wasPicked).length;
  const cardsSkipped = cardEvents.filter((event) => !event.wasPicked).length;
  const deckSize = countCards(floors, players);
  const relics = floors.reduce((sum, floor) => sum + floor.playerStats.flatMap((stats) => stats.relic_choices || []).filter((choice) => choice.was_picked).length, 0);
  const potionsUsed = floors.reduce((sum, floor) => sum + floor.playerStats.flatMap((stats) => stats.potion_used || []).length, 0);
  const economy = floors.reduce(
    (acc, floor) => {
      floor.playerStats.forEach((stats) => {
        acc.goldGained += Number(stats.gold_gained || 0);
        acc.goldSpent += Number(stats.gold_spent || 0);
        acc.damageTaken += Number(stats.damage_taken || 0);
        acc.hpHealed += Number(stats.hp_healed || 0);
      });
      return acc;
    },
    { goldGained: 0, goldSpent: 0, damageTaken: 0, hpHealed: 0 },
  );

  return {
    fileName,
    seed: run.seed || fileName.replace(/\..+$/, ""),
    character,
    startTime: Number(run.start_time || fallbackIndex),
    ascension: Number(run.ascension || 0),
    gameMode: run.game_mode || "unknown",
    win: Boolean(run.win),
    wasAbandoned: Boolean(run.was_abandoned),
    runTimeMinutes: Math.round(Number(run.run_time || 0) / 60),
    floor: floors.length,
    actCount: Array.isArray(run.acts) ? run.acts.length : 0,
    deathEncounter: cleanId(run.killed_by_encounter || "NONE"),
    deathEvent: cleanId(run.killed_by_event || "NONE"),
    deckSize,
    cardsPicked,
    cardsSkipped,
    relics,
    potionsUsed,
    currentHp: Number(lastStats.current_hp || 0),
    maxHp: Number(lastStats.max_hp || 0),
    cardEvents,
    floors: floors.map((floor) => ({
      floor: floor.floor,
      act: floor.act,
      type: floor.type,
      encounter: floor.encounter,
      damageTaken: floor.playerStats.reduce((sum, stats) => sum + Number(stats.damage_taken || 0), 0),
      currentHp: floor.playerStats[0] ? floor.playerStats[0].current_hp : null,
    })),
    ...economy,
  };
}

function flattenFloors(history = []) {
  return (history || []).flatMap((act, actIndex) =>
    (act || []).map((point, pointIndex) => {
      const rooms = Array.isArray(point.rooms) ? point.rooms : [];
      const room = rooms[0] || {};
      return {
        floor: actIndex * 17 + pointIndex + 1,
        act: actIndex + 1,
        type: point.map_point_type || room.room_type || "unknown",
        encounter: cleanId(room.model_id || room.room_type || point.map_point_type || "unknown"),
        playerStats: Array.isArray(point.player_stats) ? point.player_stats : [],
      };
    }),
  );
}

function collectCardEvents(floors) {
  const events = [];
  floors.forEach((floor) => {
    floor.playerStats.forEach((stats) => {
      (stats.card_choices || []).forEach((choice) => {
        const id = cleanId((choice.card && choice.card.id) || choice.id || "UNKNOWN_CARD");
        events.push({ id, floor: floor.floor, wasPicked: Boolean(choice.was_picked) });
      });
    });
  });
  return events;
}

function countCards(floors, players) {
  const fromPlayers = players
    .flatMap((player) => (player && (player.deck || player.cards || player.master_deck)) || [])
    .filter(Boolean).length;
  if (fromPlayers) return fromPlayers;
  const gained = floors.reduce((sum, floor) => sum + floor.playerStats.flatMap((stats) => stats.cards_gained || []).length, 0);
  return Math.max(10, 10 + gained);
}

function buildMetrics(runs) {
  const wins = runs.filter((run) => run.win).length;
  const deaths = runs.filter((run) => !run.win && !run.wasAbandoned);
  return {
    runs,
    summary: {
      total: runs.length,
      wins,
      winRate: pct(wins, runs.length),
      deaths: deaths.length,
      avgFloor: avg(runs.map((run) => run.floor)),
      avgDeck: avg(runs.map((run) => run.deckSize)),
    },
    deckBuckets: bucketDecks(runs),
    cardStats: buildCardStats(runs),
    deathStats: buildDeathStats(deaths),
    floorProgress: runs.map((run) => ({ label: `Run ${run.runIndex}`, value: run.floor, win: run.win })),
    economy: [
      { label: "Ouro ganho", value: sum(runs, "goldGained") },
      { label: "Ouro gasto", value: sum(runs, "goldSpent") },
      { label: "Dano recebido", value: sum(runs, "damageTaken") },
      { label: "HP curado", value: sum(runs, "hpHealed") },
    ],
  };
}

function bucketDecks(runs) {
  const buckets = [
    { label: "10-19", min: 10, max: 19 },
    { label: "20-29", min: 20, max: 29 },
    { label: "30-39", min: 30, max: 39 },
    { label: "40-49", min: 40, max: 49 },
    { label: "50+", min: 50, max: Infinity },
  ];
  return buckets.map((bucket) => {
    const items = runs.filter((run) => run.deckSize >= bucket.min && run.deckSize <= bucket.max);
    return { label: bucket.label, value: pct(items.filter((run) => run.win).length, items.length), count: items.length };
  });
}

function buildCardStats(runs) {
  const stats = new Map();
  runs.forEach((run) => {
    const seenPicked = new Set();
    run.cardEvents.forEach((event) => {
      const current = stats.get(event.id) || { card: event.id, offered: 0, picked: 0, winsWithPick: 0, runsWithPick: 0 };
      current.offered += 1;
      if (event.wasPicked) {
        current.picked += 1;
        seenPicked.add(event.id);
      }
      stats.set(event.id, current);
    });
    seenPicked.forEach((id) => {
      const current = stats.get(id);
      current.runsWithPick += 1;
      current.winsWithPick += run.win ? 1 : 0;
    });
  });
  return [...stats.values()]
    .map((row) => ({
      ...row,
      pickRate: pct(row.picked, row.offered),
      winRate: pct(row.winsWithPick, row.runsWithPick),
    }))
    .sort((a, b) => b.offered - a.offered || b.pickRate - a.pickRate);
}

function buildDeathStats(deaths) {
  const grouped = groupBy(deaths, (run) => run.deathEncounter || "UNKNOWN");
  return [...grouped.entries()]
    .map(([encounter, rows]) => ({
      encounter,
      deaths: rows.length,
      avgFloor: avg(rows.map((run) => run.floor)),
      avgDeck: avg(rows.map((run) => run.deckSize)),
    }))
    .sort((a, b) => b.deaths - a.deaths);
}

function renderAll() {
  updateScopedMetrics();
  renderCharacterTabs();
  renderKpis();
  renderWidgets();
  renderDetailOptions();
  renderDetail();
}

function renderCharacterTabs() {
  const container = document.getElementById("characterTabs");
  if (!state.runs.length) {
    container.classList.remove("visible");
    container.innerHTML = "";
    return;
  }
  const characters = [...new Set(state.runs.map((run) => run.character || "UNKNOWN"))].sort((a, b) => a.localeCompare(b));
  if (state.activeCharacter !== "ALL" && !characters.includes(state.activeCharacter)) {
    state.activeCharacter = "ALL";
  }
  const tabs = [["ALL", "Geral"], ...characters.map((character) => [character, character])];
  container.classList.add("visible");
  container.innerHTML = tabs
    .map(
      ([value, label]) =>
        `<button class="character-tab ${state.activeCharacter === value ? "active" : ""}" data-character="${escapeHtml(value)}">${escapeHtml(label)}</button>`,
    )
    .join("");
  container.querySelectorAll(".character-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCharacter = button.dataset.character;
      renderAll();
    });
  });
}

function renderKpis() {
  const grid = document.getElementById("kpiGrid");
  if (!state.metrics) {
    grid.innerHTML = "";
    return;
  }
  const { summary } = state.metrics;
  const items = [
    ["Runs", summary.total],
    ["Win rate", `${summary.winRate}%`],
    ["Mortes", summary.deaths],
    ["Floor medio", summary.avgFloor.toFixed(1)],
    ["Deck medio", summary.avgDeck.toFixed(1)],
  ];
  grid.innerHTML = items.map(([label, value]) => `<div class="kpi"><span class="muted">${label}</span><strong>${value}</strong></div>`).join("");
}

function renderWidgets() {
  const grid = document.getElementById("widgetGrid");
  grid.innerHTML = "";
  if (!state.metrics) {
    grid.innerHTML = `<div class="empty-state widget full">Importe suas runs para montar o dashboard.</div>`;
    return;
  }
  widgets
    .filter((widget) => state.enabled.has(widget.analysis))
    .forEach((widget) => grid.appendChild(createWidget(widget)));
  bindDrag(grid);
  renderAllCanvases();
}

function createWidget(config) {
  const template = document.getElementById("widgetTemplate").content.cloneNode(true);
  const element = template.querySelector(".widget");
  element.dataset.widgetId = config.id;
  element.classList.add(state.layout[config.id] || "medium");
  element.querySelector(".widget-type").textContent = config.type;
  element.querySelector("h3").textContent = config.title;
  config.render(element.querySelector(".widget-body"));
  element.querySelector(".expand").addEventListener("click", () => resizeWidget(element, 1));
  element.querySelector(".shrink").addEventListener("click", () => resizeWidget(element, -1));
  return element;
}

function resizeWidget(element, direction) {
  const sizes = ["small", "medium", "large", "full"];
  const id = element.dataset.widgetId;
  const current = sizes.findIndex((size) => element.classList.contains(size));
  const next = sizes[Math.max(0, Math.min(sizes.length - 1, current + direction))] || "medium";
  element.classList.remove(...sizes);
  element.classList.add(next);
  state.layout[id] = next;
  localStorage.setItem("slaytracker.layout", JSON.stringify(state.layout));
  renderAllCanvases();
}

function bindDrag(grid) {
  let dragged = null;
  grid.querySelectorAll(".widget").forEach((widget) => {
    widget.addEventListener("dragstart", () => {
      dragged = widget;
      widget.classList.add("dragging");
    });
    widget.addEventListener("dragend", () => {
      if (dragged) dragged.classList.remove("dragging");
      dragged = null;
    });
    widget.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (!dragged || dragged === widget) return;
      const rect = widget.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      grid.insertBefore(dragged, after ? widget.nextSibling : widget);
    });
  });
}

function renderFloorProgress(container) {
  drawCanvas(container, (ctx, box) => drawLine(ctx, box, state.metrics.floorProgress, "Floor"));
}

function renderDeckWinRate(container) {
  drawCanvas(container, (ctx, box) => drawBars(ctx, box, state.metrics.deckBuckets, "Win rate %", true));
}

function renderEconomy(container) {
  drawCanvas(container, (ctx, box) => drawBars(ctx, box, state.metrics.economy, "Total", false));
}

function renderCardStats(container) {
  container.innerHTML = table(
    "cardStats",
    ["Carta", "Ofertas", "Picks", "Pick rate", "Win rate"],
    state.metrics.cardStats.slice(0, 18).map((row) => [row.card, row.offered, row.picked, `${row.pickRate}%`, `${row.winRate}%`]),
  );
}

function renderDeathStats(container) {
  container.innerHTML = table(
    "deathStats",
    ["Encontro", "Mortes", "Floor medio", "Deck medio"],
    state.metrics.deathStats.slice(0, 18).map((row) => [row.encounter, row.deaths, row.avgFloor.toFixed(1), row.avgDeck.toFixed(1)]),
  );
}

function renderRunTable(container) {
  container.innerHTML = table(
    "runTable",
    ["Run", "Personagem", "Seed", "A", "Win", "Floor", "Deck", "Tempo", "Morte"],
    state.metrics.runs.map((run) => [
      run.runIndex,
      run.character,
      run.seed,
      run.ascension,
      run.win ? "Sim" : "Nao",
      run.floor,
      run.deckSize,
      `${run.runTimeMinutes}m`,
      run.deathEncounter,
    ]),
  );
}

function renderDetailOptions() {
  const select = document.getElementById("detailSelect");
  const previous = select.value;
  select.innerHTML = widgets
    .filter((widget) => state.enabled.has(widget.analysis))
    .map((widget) => `<option value="${widget.id}">${widget.title}</option>`)
    .join("");
  if ([...select.options].some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function renderDetail() {
  const container = document.getElementById("detailContent");
  if (!state.metrics) {
    container.innerHTML = `<div class="empty-state">Importe runs para visualizar tabelas e graficos.</div>`;
    return;
  }
  const selected = widgets.find((widget) => widget.id === document.getElementById("detailSelect").value) || widgets[0];
  container.innerHTML = "";
  selected.render(container);
  renderAllCanvases();
}

function addCustomChart() {
  if (!state.metrics) return;
  const x = document.getElementById("xMetric").value;
  const y = document.getElementById("yMetric").value;
  const group = document.getElementById("groupMetric").value;
  const type = document.getElementById("chartType").value;
  const label = `${labelFor(x)} x ${labelFor(y)} por ${labelFor(group)}`;
  const card = document.createElement("article");
  card.className = "custom-card";
  card.innerHTML = `<h3>${label}</h3><p class="custom-caption">${state.metrics.runs.length} runs analisadas na aba atual. Valores agrupados por ${labelFor(group)}.</p><div class="widget-body"></div>`;
  document.getElementById("customCharts").prepend(card);
  const rows = customRows(x, y, group);
  drawCanvas(card.querySelector(".widget-body"), (ctx, box) => {
    drawCustomChart(ctx, box, rows, { x, y, group, type });
  });
}

function customRows(x, y, group) {
  const grouped = groupBy(state.metrics.runs, (run) => String(run[group] == null ? "N/A" : run[group]));
  return [...grouped.entries()]
    .map(([label, runs]) => ({
      label,
      x: metricValue(runs, x),
      value: metricValue(runs, y),
      count: runs.length,
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

function metricValue(runs, metric) {
  if (metric === "win") return pct(runs.filter((run) => run.win).length, runs.length);
  if (metric === "deathEncounter" || metric === "character") return runs.length;
  return avg(runs.map((run) => Number(run[metric]) || 0));
}

function drawCustomChart(ctx, box, rows, config) {
  const chart = chartArea(box);
  clearDetailedChart(ctx, box, chart);
  const maxY = niceMax(Math.max(1, ...rows.map((row) => row.value)));
  const maxX = niceMax(Math.max(1, ...rows.map((row) => row.x)));
  drawDetailedAxes(ctx, box, chart, {
    xLabel: config.type === "scatter" ? labelFor(config.x) : labelFor(config.group),
    yLabel: labelFor(config.y),
    maxX,
    maxY,
    showXScale: config.type === "scatter",
  });

  if (!rows.length) {
    drawEmptyChart(ctx, box, "Sem dados para esta combinacao.");
    return;
  }

  if (config.type === "scatter") drawCustomScatter(ctx, chart, rows, maxX, maxY);
  else if (config.type === "line") drawCustomLine(ctx, chart, rows, maxY);
  else drawCustomBars(ctx, chart, rows, maxY);

  drawCustomLegend(ctx, box, rows, config.group);
}

function chartArea(box) {
  return {
    left: 76,
    top: 34,
    right: Math.max(120, box.width - 150),
    bottom: Math.max(120, box.height - 74),
  };
}

function clearDetailedChart(ctx, box, chart) {
  ctx.clearRect(0, 0, box.width, box.height);
  ctx.fillStyle = css("--panel");
  ctx.fillRect(0, 0, box.width, box.height);
  ctx.strokeStyle = css("--line");
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = chart.bottom - (chart.bottom - chart.top) * (i / 4);
    ctx.beginPath();
    ctx.moveTo(chart.left, y);
    ctx.lineTo(chart.right, y);
    ctx.stroke();
  }
}

function drawDetailedAxes(ctx, box, chart, options) {
  ctx.strokeStyle = css("--muted");
  ctx.fillStyle = css("--muted");
  ctx.font = "12px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i += 1) {
    const value = options.maxY * (i / 4);
    const y = chart.bottom - (chart.bottom - chart.top) * (i / 4);
    ctx.fillText(formatMetric(value, options.yLabel), chart.left - 10, y);
  }

  ctx.beginPath();
  ctx.moveTo(chart.left, chart.top);
  ctx.lineTo(chart.left, chart.bottom);
  ctx.lineTo(chart.right, chart.bottom);
  ctx.stroke();

  ctx.save();
  ctx.translate(18, chart.top + (chart.bottom - chart.top) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(options.yLabel, 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(options.xLabel, chart.left + (chart.right - chart.left) / 2, box.height - 26);

  if (options.showXScale) {
    ctx.textBaseline = "top";
    for (let i = 0; i <= 4; i += 1) {
      const value = options.maxX * (i / 4);
      const x = chart.left + (chart.right - chart.left) * (i / 4);
      ctx.fillText(formatMetric(value, options.xLabel), x, chart.bottom + 10);
    }
  }
}

function drawCustomBars(ctx, chart, rows, maxY) {
  const width = (chart.right - chart.left) / Math.max(1, rows.length);
  rows.forEach((row, index) => {
    const barHeight = (chart.bottom - chart.top) * (row.value / maxY);
    const x = chart.left + index * width + width * 0.18;
    const y = chart.bottom - barHeight;
    ctx.fillStyle = palette(index);
    ctx.fillRect(x, y, Math.max(10, width * 0.64), barHeight);
    drawValueLabel(ctx, row.value, x + width * 0.32, y - 8);
    drawRotatedLabel(ctx, shortLabel(row.label), x + width * 0.32, chart.bottom + 12);
  });
}

function drawCustomLine(ctx, chart, rows, maxY) {
  const step = (chart.right - chart.left) / Math.max(1, rows.length - 1);
  ctx.strokeStyle = css("--accent-2");
  ctx.lineWidth = 3;
  ctx.beginPath();
  rows.forEach((row, index) => {
    const x = chart.left + index * step;
    const y = chart.bottom - (chart.bottom - chart.top) * (row.value / maxY);
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  rows.forEach((row, index) => {
    const x = chart.left + index * step;
    const y = chart.bottom - (chart.bottom - chart.top) * (row.value / maxY);
    ctx.fillStyle = palette(index);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    drawValueLabel(ctx, row.value, x, y - 12);
    drawRotatedLabel(ctx, shortLabel(row.label), x, chart.bottom + 12);
  });
}

function drawCustomScatter(ctx, chart, rows, maxX, maxY) {
  rows.forEach((row, index) => {
    const x = chart.left + (chart.right - chart.left) * (row.x / maxX);
    const y = chart.bottom - (chart.bottom - chart.top) * (row.value / maxY);
    ctx.fillStyle = palette(index);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fill();
    drawValueLabel(ctx, `${shortLabel(row.label)} (${formatNumber(row.x)}, ${formatNumber(row.value)})`, x, y - 15);
  });
}

function drawCustomLegend(ctx, box, rows, group) {
  const x = box.width - 132;
  let y = 42;
  ctx.fillStyle = css("--text");
  ctx.font = "700 12px system-ui";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(labelFor(group), x, 22);
  ctx.font = "12px system-ui";
  rows.slice(0, 10).forEach((row, index) => {
    ctx.fillStyle = palette(index);
    ctx.fillRect(x, y - 9, 10, 10);
    ctx.fillStyle = css("--text");
    ctx.fillText(`${shortLabel(row.label)} (${row.count})`, x + 16, y);
    y += 18;
  });
  if (rows.length > 10) {
    ctx.fillStyle = css("--muted");
    ctx.fillText(`+${rows.length - 10} grupos`, x, y);
  }
}

function drawValueLabel(ctx, value, x, y) {
  ctx.fillStyle = css("--text");
  ctx.font = "700 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(String(typeof value === "number" ? formatNumber(value) : value), x, y);
}

function drawRotatedLabel(ctx, text, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 5);
  ctx.fillStyle = css("--muted");
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawEmptyChart(ctx, box, text) {
  ctx.fillStyle = css("--muted");
  ctx.font = "14px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(text, box.width / 2, box.height / 2);
}

function niceMax(value) {
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / magnitude) * magnitude;
}

function formatMetric(value, label) {
  return label.toLowerCase().includes("win") || label.toLowerCase().includes("vitoria") ? `${formatNumber(value)}%` : formatNumber(value);
}

function formatNumber(value) {
  return Number(value).toFixed(value >= 10 ? 0 : 1);
}

function shortLabel(value) {
  const text = String(value);
  return text.length > 16 ? `${text.slice(0, 15)}...` : text;
}

function palette(index) {
  const colors = [css("--accent-2"), css("--accent"), css("--good"), "#8fb7ff", "#e6c84f", "#ff7f9b", "#b58cff", "#64d6ff"];
  return colors[index % colors.length];
}

function drawCanvas(container, draw) {
  container.innerHTML = `<canvas></canvas>`;
  const canvas = container.querySelector("canvas");
  canvas._draw = draw;
  renderCanvas(canvas);
}

function renderAllCanvases() {
  document.querySelectorAll("canvas").forEach(renderCanvas);
}

function renderCanvas(canvas) {
  if (!canvas._draw) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(320, rect.width * dpr);
  canvas.height = Math.max(240, rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  canvas._draw(ctx, { width: canvas.width / dpr, height: canvas.height / dpr });
}

function drawBars(ctx, box, data, axisLabel, percent) {
  clearChart(ctx, box);
  const pad = 46;
  const max = Math.max(1, ...data.map((item) => item.value));
  const width = (box.width - pad * 2) / Math.max(1, data.length);
  data.forEach((item, index) => {
    const height = ((box.height - pad * 2) * item.value) / max;
    const x = pad + index * width + width * 0.14;
    const y = box.height - pad - height;
    ctx.fillStyle = index % 2 ? css("--accent-2") : css("--accent");
    ctx.fillRect(x, y, width * 0.7, height);
    ctx.fillStyle = css("--text");
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(item.label, x + width * 0.35, box.height - 18);
    ctx.fillText(`${item.value.toFixed(percent ? 0 : 1)}${percent ? "%" : ""}`, x + width * 0.35, y - 7);
  });
  axis(ctx, box, axisLabel);
}

function drawLine(ctx, box, data, axisLabel) {
  clearChart(ctx, box);
  const pad = 46;
  const max = Math.max(1, ...data.map((item) => item.value));
  const step = (box.width - pad * 2) / Math.max(1, data.length - 1);
  ctx.strokeStyle = css("--accent-2");
  ctx.lineWidth = 3;
  ctx.beginPath();
  data.forEach((item, index) => {
    const x = pad + index * step;
    const y = box.height - pad - ((box.height - pad * 2) * item.value) / max;
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  data.forEach((item, index) => {
    const x = pad + index * step;
    const y = box.height - pad - ((box.height - pad * 2) * item.value) / max;
    ctx.fillStyle = item.win ? css("--good") : css("--accent");
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  axis(ctx, box, axisLabel);
}

function drawScatter(ctx, box, rows, xLabel, yLabel) {
  clearChart(ctx, box);
  const pad = 46;
  const maxX = Math.max(1, ...rows.map((row) => row.x));
  const maxY = Math.max(1, ...rows.map((row) => row.value));
  rows.forEach((row, index) => {
    const x = pad + ((box.width - pad * 2) * row.x) / maxX;
    const y = box.height - pad - ((box.height - pad * 2) * row.value) / maxY;
    ctx.fillStyle = index % 2 ? css("--accent") : css("--accent-2");
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
  });
  axis(ctx, box, `${labelFor(xLabel)} / ${labelFor(yLabel)}`);
}

function clearChart(ctx, box) {
  ctx.clearRect(0, 0, box.width, box.height);
  ctx.fillStyle = css("--panel");
  ctx.fillRect(0, 0, box.width, box.height);
  ctx.strokeStyle = css("--line");
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = 46 + i * ((box.height - 92) / 3);
    ctx.beginPath();
    ctx.moveTo(46, y);
    ctx.lineTo(box.width - 46, y);
    ctx.stroke();
  }
}

function axis(ctx, box, label) {
  ctx.fillStyle = css("--muted");
  ctx.font = "12px system-ui";
  ctx.textAlign = "left";
  ctx.fillText(label, 12, 22);
  ctx.strokeStyle = css("--line");
  ctx.beginPath();
  ctx.moveTo(46, box.height - 46);
  ctx.lineTo(box.width - 46, box.height - 46);
  ctx.stroke();
}

function table(tableId, headers, rows) {
  const sortedRows = sortRows(tableId, rows);
  const sort = state.tableSort[tableId] || {};
  return `<div class="table-wrap"><table><thead><tr>${headers
    .map(
      (header, index) =>
        `<th><button class="sort-button ${sort.column === index ? sort.direction : ""}" data-table-id="${escapeHtml(tableId)}" data-column="${index}">${escapeHtml(header)}</button></th>`,
    )
    .join("")}</tr></thead><tbody>${sortedRows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell == null ? "" : cell))}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>`;
}

function sortRows(tableId, rows) {
  const sort = state.tableSort[tableId];
  if (!sort) return rows;
  return [...rows].sort((a, b) => {
    const left = sortableValue(a[sort.column]);
    const right = sortableValue(b[sort.column]);
    const result = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
    return sort.direction === "asc" ? result : -result;
  });
}

function sortableValue(value) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = String(value == null ? "" : value).trim();
  const normalized = text.replace("%", "").replace("m", "").replace(",", ".");
  if (normalized !== "" && !Number.isNaN(Number(normalized))) return Number(normalized);
  return text.toLowerCase();
}

function cleanId(value) {
  return String(value || "NONE")
    .replace(/^(CARD|RELIC|POTION|ENCOUNTER|EVENT|MONSTER|ACT|NONE)\./, "")
    .replaceAll("_", " ");
}

function avg(values) {
  const numeric = values.map(Number).filter(Number.isFinite);
  return numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : 0;
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function pct(part, total) {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

function groupBy(rows, getter) {
  return rows.reduce((map, row) => {
    const key = getter(row);
    map.set(key, [...(map.get(key) || []), row]);
    return map;
  }, new Map());
}

function labelFor(value) {
  const option = metricOptions.find(([key]) => key === value);
  return option ? option[1] : value;
}

function css(variable) {
  return getComputedStyle(document.body).getPropertyValue(variable).trim();
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

function makeDemoRuns() {
  return Array.from({ length: 12 }, (_, index) => {
    const floor = 12 + index * 3 + (index % 3) * 4;
    const win = index % 5 === 0;
    const cards = ["STRIKE", "SHROUD", "NEGATIVE PULSE", "WISP", "SCOURGE", "MAD SCIENCE"];
    return {
      fileName: `demo-${index + 1}.run`,
      seed: `DEMO${index + 1}`,
      startTime: index,
      runIndex: index + 1,
      character: ["IRONCLAD", "SILENT", "NECROBINDER"][index % 3],
      ascension: index % 10,
      gameMode: "standard",
      win,
      wasAbandoned: false,
      runTimeMinutes: 24 + index * 3,
      floor,
      actCount: Math.ceil(floor / 17),
      deathEncounter: win ? "NONE" : ["SCROLLS OF BITING", "CULTIST", "CONSTRUCT MENAGERIE"][index % 3],
      deathEvent: "NONE",
      deckSize: 18 + index * 2,
      cardsPicked: 8 + index,
      cardsSkipped: 12 + index,
      relics: 2 + (index % 7),
      potionsUsed: index % 4,
      currentHp: win ? 41 : 0,
      maxHp: 70 + index,
      goldGained: 110 + index * 24,
      goldSpent: 30 + index * 11,
      damageTaken: 20 + index * 9,
      hpHealed: 15 + index * 5,
      cardEvents: cards.flatMap((id, cardIndex) => [
        { id, floor: cardIndex + 1, wasPicked: (cardIndex + index) % 3 === 0 },
        { id, floor: cardIndex + 3, wasPicked: (cardIndex + index) % 4 === 0 },
      ]),
      floors: [],
    };
  });
}

window.addEventListener("resize", renderAllCanvases);

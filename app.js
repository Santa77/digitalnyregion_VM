'use strict';

const API = 'api.php';
const REFRESH_MS = 5 * 60 * 1000;

// Palette for chart lines (repeats if more than 20 projects)
const PALETTE = [
  '#0ea5e9','#f59e0b','#10b981','#f43f5e','#8b5cf6',
  '#ec4899','#14b8a6','#fb923c','#a3e635','#06b6d4',
  '#e879f9','#fbbf24','#34d399','#f87171','#818cf8',
  '#fb7185','#2dd4bf','#fdba74','#bef264','#67e8f9',
];

function loadFiltersFromHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    region: params.get('region') ?? '',
    hours: parseInt(params.get('hours') ?? '0', 10) || 0,
    trendWindow: parseInt(params.get('tw') ?? '10', 10) || 10,
  };
}

function persistFilters() {
  const params = new URLSearchParams();
  if (state.region) params.set('region', state.region);
  if (state.hours) params.set('hours', String(state.hours));
  if (state.trendWindow !== 10) params.set('tw', String(state.trendWindow));
  const hash = params.toString();
  history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
}

const { region: savedRegion, hours: savedHours, trendWindow: savedTrendWindow } = loadFiltersFromHash();

let state = {
  region: savedRegion,
  hours: savedHours,
  trendWindow: savedTrendWindow,
  latestData: null,
  historyData: null,
  chart: null,
  trendChart: null,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmt(n) {
  return Number(n).toLocaleString('sk-SK');
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('sk-SK', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function showError(msg) {
  const container = document.getElementById('error-toast-container');
  const id = 'toast-' + Date.now();
  container.insertAdjacentHTML('beforeend', `
    <div id="${id}" class="toast align-items-center text-bg-danger border-0 show mb-2" role="alert">
      <div class="d-flex">
        <div class="toast-body"><i class="bi bi-exclamation-triangle me-2"></i>${msg}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>`);
  setTimeout(() => document.getElementById(id)?.remove(), 6000);
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function apiFetch(params) {
  const url = API + '?' + new URLSearchParams(params);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Regions dropdown ──────────────────────────────────────────────────────────

async function fetchRegions() {
  try {
    const regions = await apiFetch({ action: 'regions' });
    const menu = document.getElementById('region-menu');
    regions.forEach(r => {
      const li = document.createElement('li');
      li.innerHTML = `<a class="dropdown-item" href="#" data-region="${r}">${r}</a>`;
      menu.appendChild(li);
    });
    // Apply persisted region selection after dropdown is populated
    document.getElementById('region-label').textContent =
      state.region || 'Všetky regióny';
    document.querySelectorAll('#region-menu .dropdown-item').forEach(el =>
      el.classList.toggle('active', el.dataset.region === state.region));
  } catch (e) {
    showError('Nepodarilo sa načítať regióny: ' + e.message);
  }
}

// ── Latest data + cards ───────────────────────────────────────────────────────

async function fetchLatest() {
  try {
    const data = await apiFetch({ action: 'latest' });
    state.latestData = data;
    renderCards(data);
    updateStats(data);
    document.getElementById('last-update').innerHTML =
      `<i class="bi bi-clock me-1"></i>Aktualizované: ${fmtDate(data.fetchedAt)}`;
  } catch (e) {
    showError('Nepodarilo sa načítať dáta: ' + e.message);
  }
}

function getFilteredProjects(data) {
  const projects = data.projects ?? data;
  if (!state.region) return projects;
  return projects.filter(p => p.region === state.region);
}

function renderCards(data) {
  const projects = getFilteredProjects(data);
  const sorted = [...projects].sort((a, b) => (b.votesCount ?? 0) - (a.votesCount ?? 0));
  const grid = document.getElementById('cards-grid');
  grid.innerHTML = '';

  sorted.forEach((p, i) => {
    const rank = i + 1;
    const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6 col-lg-4 col-xl-3';
    col.innerHTML = `
      <div class="project-card h-100">
        <div class="d-flex align-items-start gap-2 mb-2">
          <span class="rank-badge ${rankClass}">${rank}</span>
          <div class="flex-grow-1 min-w-0">
            <div class="project-title">${escHtml(p.title ?? '')}</div>
            <div class="project-meta">
              <i class="bi bi-geo-alt me-1"></i>${escHtml(p.city ?? '')}
              <span class="ms-2"><i class="bi bi-map me-1"></i>${escHtml(p.region ?? '')}</span>
            </div>
          </div>
          <div class="votes-count">${fmt(p.votesCount ?? 0)}</div>
        </div>
        <div>
          <span class="badge-category">${escHtml(p.category ?? '')}</span>
        </div>
      </div>`;
    grid.appendChild(col);
  });

  if (sorted.length === 0) {
    grid.innerHTML = '<div class="col text-center text-muted py-5">Žiadne projekty pre vybraný región.</div>';
  }
}

function updateStats(data) {
  const projects = getFilteredProjects(data);
  const sorted = [...projects].sort((a, b) => (b.votesCount ?? 0) - (a.votesCount ?? 0));
  const totalVotes = projects.reduce((s, p) => s + (p.votesCount ?? 0), 0);
  const regions = [...new Set(projects.map(p => p.region).filter(Boolean))];

  document.getElementById('stat-projects').textContent = fmt(projects.length);
  document.getElementById('stat-votes').textContent = fmt(totalVotes);
  document.getElementById('stat-leader').textContent = sorted[0]?.title?.split(' ').slice(0, 3).join(' ') ?? '—';
  document.getElementById('stat-regions').textContent = fmt(regions.length);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Chart ─────────────────────────────────────────────────────────────────────

async function fetchHistory() {
  const params = { action: 'history' };
  if (state.region) params.region = state.region;
  if (state.hours) params.hours = state.hours;

  try {
    const data = await apiFetch(params);
    state.historyData = data;
    renderChart(data);
    renderTrendChart(data, state.trendWindow);
  } catch (e) {
    showError('Nepodarilo sa načítať históriu: ' + e.message);
  }
}

function renderChart(data) {
  const { timestamps, projects } = data;

  if (!timestamps?.length) {
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    return;
  }

  const labels = timestamps.map(t => new Date(t));

  const datasets = Object.entries(projects).map(([, proj], idx) => ({
    label: proj.title,
    data: proj.votes,
    borderColor: PALETTE[idx % PALETTE.length],
    backgroundColor: 'transparent',
    borderWidth: 2,
    pointRadius: timestamps.length > 100 ? 0 : 3,
    pointHoverRadius: 5,
    tension: 0.3,
  }));

  const ctx = document.getElementById('votes-chart').getContext('2d');

  if (state.chart) {
    state.chart.data.labels = labels;
    state.chart.data.datasets = datasets;
    state.chart.update('none');
    return;
  }

  state.chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            boxWidth: 12,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
          callbacks: {
            title: items => {
              try {
                return new Date(items[0].parsed.x).toLocaleString('sk-SK', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                });
              } catch { return ''; }
            },
            label: item => ` ${item.dataset.label}: ${fmt(item.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { tooltipFormat: 'dd.MM HH:mm' },
          ticks: { color: '#94a3b8', maxTicksLimit: 10, font: { size: 11 } },
          grid: { color: '#1e293b' },
        },
        y: {
          beginAtZero: false,
          ticks: {
            color: '#94a3b8',
            font: { size: 11 },
            callback: v => fmt(v),
          },
          grid: { color: '#334155' },
        },
      },
    },
  });
}

// ── Trend chart ───────────────────────────────────────────────────────────────

function buildRankMap() {
  if (!state.latestData) return {};
  const projects = state.latestData.projects ?? state.latestData;
  const filtered = state.region ? projects.filter(p => p.region === state.region) : projects;
  const sorted = [...filtered].sort((a, b) => (b.votesCount ?? 0) - (a.votesCount ?? 0));
  const map = {};
  sorted.forEach((p, i) => { map[p.title] = i + 1; });
  return map;
}

function drawPill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x,     y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

const RANK_COLORS = ['#f59e0b', '#94a3b8', '#cd7c4e']; // gold / silver / bronze

const rankLabelPlugin = {
  id: 'rankLabels',
  afterDatasetsDraw(chart) {
    const ranks = chart._ranks;
    if (!ranks) return;
    const ctx = chart.ctx;
    const meta = chart.getDatasetMeta(0);
    const PILL_H  = 18;
    const PILL_PX = 7;  // horizontal padding inside pill
    const PILL_R  = 9;  // border radius
    const MARGIN  = 5;  // gap from bar left edge

    meta.data.forEach((bar, i) => {
      const rank = ranks[i];
      if (!rank) return;
      const barLeft  = Math.min(bar.x, bar.base);
      const barRight = Math.max(bar.x, bar.base);
      const barWidth = barRight - barLeft;

      const label = '#' + rank;
      ctx.save();
      ctx.font = 'bold 11px system-ui, sans-serif';
      const textW   = ctx.measureText(label).width;
      const pillW   = textW + PILL_PX * 2;

      if (pillW + MARGIN * 2 > barWidth) { ctx.restore(); return; }

      const px = barLeft + MARGIN;
      const py = bar.y - PILL_H / 2;

      // Pill background
      const bgColor = rank <= 3 ? RANK_COLORS[rank - 1] : 'rgba(15,23,42,0.82)';
      drawPill(ctx, px, py, pillW, PILL_H, PILL_R);
      ctx.fillStyle = bgColor;
      ctx.fill();

      // Pill border for non-podium ranks
      if (rank > 3) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Text
      ctx.fillStyle = rank === 2 ? '#0f172a' : '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px + pillW / 2, bar.y);
      ctx.restore();
    });
  },
};

function setTrendChartHeight(count) {
  const BAR_HEIGHT = 36;
  const OVERHEAD   = 48; // axes + padding
  const height = Math.max(80, count * BAR_HEIGHT + OVERHEAD);
  document.querySelector('.chart-container--trend').style.height = height + 'px';
}

function renderTrendChart(historyData, window) {
  const { timestamps, projects } = historyData;

  if (!timestamps?.length) {
    if (state.trendChart) { state.trendChart.destroy(); state.trendChart = null; }
    return;
  }

  const rankMap = buildRankMap();

  // Compute delta for each project over the last `window` snapshots
  const n = Math.min(window, timestamps.length);
  const entries = Object.entries(projects)
    .map(([, proj]) => {
      const votes = proj.votes;
      const last  = votes[votes.length - 1] ?? 0;
      const first = votes[Math.max(0, votes.length - n)] ?? 0;
      return { title: proj.title, delta: last - first, rank: rankMap[proj.title] ?? null, currentVotes: last };
    })
    .filter(e => e.delta !== 0)
    .sort((a, b) => b.delta - a.delta);

  const labels       = entries.map(e => e.title);
  const deltas       = entries.map(e => e.delta);
  const ranks        = entries.map(e => e.rank);
  const currentVotes = entries.map(e => e.currentVotes);
  const colors  = deltas.map(d => d >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(244,63,94,0.8)');
  const borders = deltas.map(d => d >= 0 ? '#10b981' : '#f43f5e');

  setTrendChartHeight(entries.length);

  const ctx = document.getElementById('trend-chart').getContext('2d');

  if (state.trendChart) {
    state.trendChart._ranks        = ranks;
    state.trendChart._currentVotes = currentVotes;
    state.trendChart.data.labels   = labels;
    state.trendChart.data.datasets[0].data            = deltas;
    state.trendChart.data.datasets[0].backgroundColor = colors;
    state.trendChart.data.datasets[0].borderColor     = borders;
    state.trendChart.update('none');
    return;
  }

  state.trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Prírastok hlasov',
        data: deltas,
        backgroundColor: colors,
        borderColor: borders,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          callbacks: {
            title: items => items[0].label ?? '',
            label: item => {
              const val   = item.parsed.x;
              const rank  = state.trendChart?._ranks?.[item.dataIndex];
              const total = state.trendChart?._currentVotes?.[item.dataIndex];
              const deltaStr = ` ${val >= 0 ? '+' : ''}${fmt(val)} hlasov`;
              const totalStr = total != null ? `  |  spolu: ${fmt(total)}` : '';
              const rankStr  = rank ? `  |  poradie: #${rank}` : '';
              return deltaStr + totalStr + rankStr;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 11 }, callback: v => (v >= 0 ? '+' : '') + fmt(v) },
          grid: { color: '#334155' },
        },
        y: {
          ticks: { color: '#e2e8f0', font: { size: 11 } },
          grid: { color: '#1e293b' },
        },
      },
    },
    plugins: [rankLabelPlugin],
  });

  state.trendChart._ranks        = ranks;
  state.trendChart._currentVotes = currentVotes;
}

// ── Events ────────────────────────────────────────────────────────────────────

document.getElementById('region-menu').addEventListener('click', e => {
  const item = e.target.closest('[data-region]');
  if (!item) return;
  e.preventDefault();

  state.region = item.dataset.region;
  persistFilters();
  document.getElementById('region-label').textContent =
    state.region || 'Všetky regióny';

  document.querySelectorAll('#region-menu .dropdown-item').forEach(el =>
    el.classList.toggle('active', el.dataset.region === state.region));

  if (state.latestData) renderCards(state.latestData);
  if (state.latestData) updateStats(state.latestData);
  fetchHistory();
});

document.getElementById('hours-filter').addEventListener('click', e => {
  const btn = e.target.closest('[data-hours]');
  if (!btn) return;

  state.hours = parseInt(btn.dataset.hours, 10);
  persistFilters();
  document.querySelectorAll('#hours-filter button').forEach(b =>
    b.classList.toggle('active', b === btn));

  fetchHistory();
});

document.getElementById('trend-filter').addEventListener('click', e => {
  const btn = e.target.closest('[data-window]');
  if (!btn) return;

  state.trendWindow = parseInt(btn.dataset.window, 10);
  persistFilters();
  document.querySelectorAll('#trend-filter button').forEach(b =>
    b.classList.toggle('active', b === btn));

  if (state.historyData) renderTrendChart(state.historyData, state.trendWindow);
});

// ── Init + auto-refresh ───────────────────────────────────────────────────────

async function init() {
  // Apply persisted filter button states
  document.querySelectorAll('#hours-filter button').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.hours, 10) === state.hours));
  document.querySelectorAll('#trend-filter button').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.window, 10) === state.trendWindow));

  await Promise.all([fetchLatest(), fetchRegions(), fetchHistory()]);
}

function startAutoRefresh() {
  setInterval(() => {
    Promise.all([fetchLatest(), fetchHistory()]).catch(() => {});
  }, REFRESH_MS);
}

init().then(startAutoRefresh);

// ========== Oura Health Dashboard ==========

const API_BASE = 'https://api.ouraring.com/v2/usercollection';
const TOKEN_KEY = 'oura_access_token';

// ---- State ----
let token = localStorage.getItem(TOKEN_KEY) || '';
let charts = {};

// ---- DOM refs ----
const $ = (sel) => document.querySelector(sel);
const tokenModal = $('#token-modal');
const tokenInput = $('#token-input');
const tokenSubmit = $('#token-submit');
const tokenError = $('#token-error');
const app = $('#app');
const loading = $('#loading');
const dateRange = $('#date-range');
const refreshBtn = $('#refresh-btn');
const logoutBtn = $('#logout-btn');

// ========== Auth ==========

function showModal() {
  tokenModal.classList.remove('hidden');
  app.classList.add('hidden');
}

function hideModal() {
  tokenModal.classList.add('hidden');
  app.classList.remove('hidden');
}

tokenSubmit.addEventListener('click', async () => {
  const val = tokenInput.value.trim();
  if (!val) {
    tokenError.textContent = 'トークンを入力してください。';
    return;
  }
  tokenError.textContent = '';
  tokenSubmit.disabled = true;
  tokenSubmit.textContent = '確認中...';

  try {
    const res = await fetch('https://api.ouraring.com/v2/usercollection/personal_info', {
      headers: { Authorization: `Bearer ${val}` },
    });
    if (!res.ok) throw new Error('Invalid token');
    token = val;
    localStorage.setItem(TOKEN_KEY, token);
    hideModal();
    loadDashboard();
  } catch {
    tokenError.textContent = 'トークンが無効です。もう一度お試しください。';
  } finally {
    tokenSubmit.disabled = false;
    tokenSubmit.textContent = '接続する';
  }
});

tokenInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') tokenSubmit.click();
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem(TOKEN_KEY);
  token = '';
  Object.values(charts).forEach((c) => c.destroy());
  charts = {};
  showModal();
});

refreshBtn.addEventListener('click', () => loadDashboard());
dateRange.addEventListener('change', () => loadDashboard());

// ========== API Helpers ==========

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

function getRange() {
  const days = parseInt(dateRange.value, 10);
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  return { start_date: dateStr(start), end_date: dateStr(end) };
}

async function apiFetch(endpoint, params = {}) {
  const url = new URL(`${API_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem(TOKEN_KEY);
    token = '';
    showModal();
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ========== Dashboard Load ==========

async function loadDashboard() {
  loading.classList.remove('hidden');
  const range = getRange();

  try {
    const [sleepData, activityData, readinessData, sleepTimeData, hrData] = await Promise.all([
      apiFetch('daily_sleep', range),
      apiFetch('daily_activity', range),
      apiFetch('daily_readiness', range),
      apiFetch('sleep', range),
      apiFetch('heartrate', { ...range }),
    ]);

    renderScoreCards(sleepData.data, activityData.data, readinessData.data);
    renderSleepDurationChart(sleepData.data);
    renderSleepStagesChart(sleepTimeData.data);
    renderReadinessTrendChart(readinessData.data);
    renderActivityChart(activityData.data);
    renderHeartRateChart(sleepData.data);
    renderHRVChart(sleepData.data);
    renderTempChart(readinessData.data);
    renderActivityBreakdownChart(activityData.data);
  } catch (err) {
    console.error('Dashboard load error:', err);
  } finally {
    loading.classList.add('hidden');
  }
}

// ========== Score Cards ==========

function setRing(circleId, score) {
  const circle = document.getElementById(circleId);
  if (!circle) return;
  const circumference = 2 * Math.PI * 52; // r=52
  const offset = circumference - (score / 100) * circumference;
  circle.style.strokeDashoffset = offset;
}

function scoreLabel(score) {
  if (score >= 85) return '最高';
  if (score >= 70) return '良好';
  if (score >= 60) return '普通';
  return '注意';
}

function renderScoreCards(sleepData, activityData, readinessData) {
  const latest = (arr) => arr.length > 0 ? arr[arr.length - 1] : null;

  const r = latest(readinessData);
  const s = latest(sleepData);
  const a = latest(activityData);

  if (r && r.score != null) {
    $('#readiness-score').textContent = r.score;
    setRing('readiness-circle', r.score);
    $('#readiness-sub').textContent = scoreLabel(r.score);
  }
  if (s && s.score != null) {
    $('#sleep-score').textContent = s.score;
    setRing('sleep-circle', s.score);
    $('#sleep-sub').textContent = scoreLabel(s.score);
  }
  if (a && a.score != null) {
    $('#activity-score').textContent = a.score;
    setRing('activity-circle', a.score);
    $('#activity-sub').textContent = scoreLabel(a.score);
  }
}

// ========== Chart Helpers ==========

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#8b8fa3', font: { size: 11 } },
    },
    tooltip: {
      backgroundColor: '#1a1d27',
      titleColor: '#e4e6ed',
      bodyColor: '#e4e6ed',
      borderColor: '#2a2e3d',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      ticks: { color: '#8b8fa3', font: { size: 10 }, maxRotation: 45 },
      grid: { color: '#2a2e3d' },
    },
    y: {
      ticks: { color: '#8b8fa3', font: { size: 10 } },
      grid: { color: '#2a2e3d' },
    },
  },
};

function makeOrUpdate(id, config) {
  if (charts[id]) {
    charts[id].destroy();
  }
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx, config);
}

function formatHours(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ========== Charts ==========

function renderSleepDurationChart(data) {
  const labels = data.map((d) => d.day);
  const durations = data.map((d) => d.contributors?.total_sleep ? (d.contributors.total_sleep) : (d.timestamp ? 0 : 0));
  // Use total_sleep_duration from the sleep endpoint if available, otherwise approximate from score
  const totalSleep = data.map((d) => {
    // daily_sleep doesn't have duration directly; we use the score as proxy or the detailed sleep data
    return d.score || 0;
  });

  makeOrUpdate('sleep-duration-chart', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '睡眠スコア',
        data: totalSleep,
        backgroundColor: 'rgba(108, 92, 231, 0.6)',
        borderColor: '#6c5ce7',
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderSleepStagesChart(sleepSessions) {
  // Get the latest sleep session
  const latest = sleepSessions.length > 0 ? sleepSessions[sleepSessions.length - 1] : null;
  if (!latest) return;

  const deep = latest.deep_sleep_duration || 0;
  const light = latest.light_sleep_duration || 0;
  const rem = latest.rem_sleep_duration || 0;
  const awake = latest.awake_time || 0;

  makeOrUpdate('sleep-stages-chart', {
    type: 'doughnut',
    data: {
      labels: ['深い睡眠', '浅い睡眠', 'REM睡眠', '覚醒'],
      datasets: [{
        data: [deep, light, rem, awake],
        backgroundColor: ['#6c5ce7', '#a29bfe', '#74b9ff', '#636e72'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8b8fa3', font: { size: 11 }, padding: 12 },
        },
        tooltip: {
          ...chartDefaults.plugins.tooltip,
          callbacks: {
            label: (ctx) => `${ctx.label}: ${formatHours(ctx.raw)}`,
          },
        },
      },
    },
  });
}

function renderReadinessTrendChart(data) {
  const labels = data.map((d) => d.day);
  const scores = data.map((d) => d.score);

  makeOrUpdate('readiness-trend-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'レディネス',
        data: scores,
        borderColor: '#00cec9',
        backgroundColor: 'rgba(0, 206, 201, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
      }],
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
      },
      scales: {
        ...chartDefaults.scales,
        y: { ...chartDefaults.scales.y, min: 0, max: 100 },
      },
    },
  });
}

function renderActivityChart(data) {
  const labels = data.map((d) => d.day);
  const cals = data.map((d) => d.active_calories || 0);
  const steps = data.map((d) => d.steps || 0);

  makeOrUpdate('activity-chart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '歩数',
          data: steps,
          backgroundColor: 'rgba(253, 203, 110, 0.6)',
          borderColor: '#fdcb6e',
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: '消費カロリー (kcal)',
          data: cals,
          type: 'line',
          borderColor: '#e17055',
          backgroundColor: 'rgba(225, 112, 85, 0.1)',
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      ...chartDefaults,
      scales: {
        x: chartDefaults.scales.x,
        y: {
          ...chartDefaults.scales.y,
          position: 'left',
          title: { display: true, text: '歩数', color: '#8b8fa3' },
        },
        y1: {
          ...chartDefaults.scales.y,
          position: 'right',
          title: { display: true, text: 'kcal', color: '#8b8fa3' },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function renderHeartRateChart(sleepData) {
  const labels = sleepData.map((d) => d.day);
  const hrMin = sleepData.map((d) => d.contributors?.resting_heart_rate || null);

  // Since daily_sleep doesn't directly expose resting HR, we show what's available
  // The readiness data has better HR info, but we work with what we have
  const lowestHr = sleepData.map((d) => {
    // Approximate from contributors if available
    return d.contributors?.resting_heart_rate || null;
  });

  makeOrUpdate('hr-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '安静時心拍数スコア',
        data: hrMin,
        borderColor: '#e17055',
        backgroundColor: 'rgba(225, 112, 85, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        spanGaps: true,
      }],
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderHRVChart(sleepData) {
  const labels = sleepData.map((d) => d.day);
  const hrv = sleepData.map((d) => d.contributors?.hrv_balance || null);

  makeOrUpdate('hrv-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'HRVバランススコア',
        data: hrv,
        borderColor: '#00b894',
        backgroundColor: 'rgba(0, 184, 148, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        spanGaps: true,
      }],
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderTempChart(readinessData) {
  const labels = readinessData.map((d) => d.day);
  const temp = readinessData.map((d) => d.contributors?.body_temperature || null);

  makeOrUpdate('temp-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '体温スコア',
        data: temp,
        borderColor: '#74b9ff',
        backgroundColor: 'rgba(116, 185, 255, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 6,
        spanGaps: true,
      }],
    },
    options: {
      ...chartDefaults,
      plugins: {
        ...chartDefaults.plugins,
        legend: { display: false },
      },
    },
  });
}

function renderActivityBreakdownChart(activityData) {
  const latest = activityData.length > 0 ? activityData[activityData.length - 1] : null;
  if (!latest) return;

  const high = latest.high_activity_time || 0;
  const medium = latest.medium_activity_time || 0;
  const low = latest.low_activity_time || 0;
  const sedentary = latest.sedentary_time || 0;
  const rest = latest.rest_time || 0;

  makeOrUpdate('activity-breakdown-chart', {
    type: 'doughnut',
    data: {
      labels: ['高強度', '中強度', '低強度', '座位', '休息'],
      datasets: [{
        data: [high, medium, low, sedentary, rest],
        backgroundColor: ['#e17055', '#fdcb6e', '#00b894', '#636e72', '#2d3436'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#8b8fa3', font: { size: 11 }, padding: 12 },
        },
        tooltip: {
          ...chartDefaults.plugins.tooltip,
          callbacks: {
            label: (ctx) => {
              const mins = Math.round(ctx.raw / 60);
              return `${ctx.label}: ${mins}分`;
            },
          },
        },
      },
    },
  });
}

// ========== Init ==========

function init() {
  if (token) {
    hideModal();
    loadDashboard();
  } else {
    showModal();
  }
}

init();

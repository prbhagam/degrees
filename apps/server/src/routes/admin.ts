// Owner: Christian (Server & Infra) — admin web panel and batch matching demo trigger.
import { Hono } from 'hono';
import { runPeriodicBatchMatching, type BatchMatchSummary } from '../matching/periodicMatch.js';
import type { AppEnv } from '../middleware/auth.js';

export const adminRoutes = new Hono<AppEnv>()
  .get('/', (context) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Degrees Admin — Demo Control Panel</title>
  <style>
    :root {
      --bg: #F7F3EC;
      --paper-raised: #FFFFFF;
      --ink: #20201C;
      --muted: #8A8378;
      --line: #E4DDD0;
      --ember: #B8501F;
      --ember-light: #FBF0EB;
      --sage: #5B7A6B;
      --sage-light: #EDF3F0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--ink);
      padding: 40px 20px;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 800px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    header {
      border-bottom: 2px solid var(--line);
      padding-bottom: 16px;
    }
    h1 {
      font-size: 28px;
      font-weight: 700;
      color: var(--ink);
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--ember-light);
      color: var(--ember);
      padding: 4px 8px;
      border-radius: 6px;
      font-weight: 600;
    }
    p.subtitle {
      color: var(--muted);
      margin-top: 6px;
      font-size: 15px;
    }
    .card {
      background: var(--paper-raised);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    .card-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .card-desc {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .btn {
      background: var(--ember);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 14px 24px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: background 0.15s ease;
    }
    .btn:hover:not(:disabled) {
      background: #9E4318;
    }
    .btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-top: 20px;
    }
    .stat-box {
      background: var(--bg);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid var(--line);
    }
    .stat-label {
      font-size: 12px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: var(--ink);
      margin-top: 4px;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
      font-size: 14px;
    }
    .results-table th, .results-table td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
    }
    .results-table th {
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: var(--bg);
    }
    .status-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-success {
      background: var(--sage-light);
      color: var(--sage);
    }
    .status-skipped {
      background: #ECEAE4;
      color: var(--muted);
    }
    .spinner {
      border: 3px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top: 3px solid #ffffff;
      width: 18px;
      height: 18px;
      animation: spin 1s linear infinite;
      display: inline-block;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Degrees <span>Admin Panel</span> <span class="badge">Demo Control</span></h1>
      <p class="subtitle">Orchestrate periodic time-triggered group matching and demo events.</p>
    </header>

    <div class="card">
      <div class="card-title">Time-Triggered Group Formation</div>
      <div class="card-desc">
        Trigger a full periodic match run for all users across the network.
        <br>• Enforces: Users with 0 first-degree connections cannot match with anyone.
        <br>• Matches each eligible user into 1 to 3 distinct groups.
      </div>
      <button id="runBtn" class="btn" onclick="triggerBatchMatch()">
        <span id="btnIcon">⚡</span>
        <span id="btnText">Force Run Group Formation for All Users</span>
      </button>

      <div id="resultsSection" style="display: none; margin-top: 24px;">
        <hr style="border: 0; border-top: 1px solid var(--line); margin-bottom: 20px;">
        <h3 style="font-size: 16px; font-weight: 600;">Run Summary</h3>
        <div class="stats-grid">
          <div class="stat-box">
            <div class="stat-label">Total Users</div>
            <div id="statTotal" class="stat-value">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Matched Users</div>
            <div id="statEligible" class="stat-value">0</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">Groups Created</div>
            <div id="statGroups" class="stat-value">0</div>
          </div>
        </div>

        <table class="results-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Groups</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody id="resultsBody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    async function triggerBatchMatch() {
      const btn = document.getElementById('runBtn');
      const btnText = document.getElementById('btnText');
      const btnIcon = document.getElementById('btnIcon');
      const resultsSection = document.getElementById('resultsSection');
      const resultsBody = document.getElementById('resultsBody');

      btn.disabled = true;
      btnIcon.innerHTML = '<div class="spinner"></div>';
      btnText.innerText = 'Running Matching Pipeline...';

      try {
        const res = await fetch('/admin/api/match-all', { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
          alert('Error running batch match: ' + (data.error?.message || 'Unknown error'));
          return;
        }

        document.getElementById('statTotal').innerText = data.totalUsers;
        document.getElementById('statEligible').innerText = data.eligibleUsers;
        document.getElementById('statGroups').innerText = data.groupsCreated;

        resultsBody.innerHTML = '';
        data.results.forEach(r => {
          const tr = document.createElement('tr');
          const isSuccess = r.groupsCreated > 0;
          tr.innerHTML = \`
            <td style="font-weight: 600;">\${r.username}</td>
            <td>
              <span class="status-tag \${isSuccess ? 'status-success' : 'status-skipped'}">
                \${isSuccess ? 'Matched' : 'Skipped'}
              </span>
            </td>
            <td>\${r.groupsCreated}</td>
            <td style="color: var(--muted); font-size: 13px;">\${r.skippedReason || (r.groupIds.length + ' group(s) created')}</td>
          \`;
          resultsBody.appendChild(tr);
        });

        resultsSection.style.display = 'block';
      } catch (err) {
        alert('Network or server error: ' + err.message);
      } finally {
        btn.disabled = false;
        btnIcon.innerText = '⚡';
        btnText.innerText = 'Force Run Group Formation for All Users';
      }
    }
  </script>
</body>
</html>`;
    return context.html(html);
  })
  .post('/api/match-all', async (context) => {
    try {
      const summary: BatchMatchSummary = await runPeriodicBatchMatching();
      return context.json(summary);
    } catch (err) {
      return context.json(
        {
          error: {
            code: 'batch_match_failed',
            message: err instanceof Error ? err.message : 'Batch matching failed',
          },
        },
        500,
      );
    }
  });

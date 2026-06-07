/* Participant live refresh: re-fetch state every 30s and update the table +
   fixture scores/status/points in place, without a full page reload. */
(function () {
  var root = document.querySelector('.participant');
  if (!root) return;
  var token = root.getAttribute('data-token');
  var INTERVAL = 30000;

  function statusText(f) {
    if (f.status === 'finished') return 'FT';
    if (f.status === 'live') return 'LIVE ' + (f.liveClock || '');
    return new Date(f.kickoff).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
  function scoreText(f) {
    return (f.home.goals != null && f.away.goals != null)
      ? (f.home.goals + ' – ' + f.away.goals) : 'v';
  }
  function gd(n) { return n > 0 ? '+' + n : String(n); }

  function updateFixtures(fixtures) {
    fixtures.forEach(function (f) {
      var el = root.querySelector('.fixture[data-fixture-id="' + f.id + '"]');
      if (!el) return;
      el.classList.remove('scheduled', 'live', 'finished');
      el.classList.add(f.status);
      var st = el.querySelector('[data-status]');
      var sc = el.querySelector('[data-score]');
      var pt = el.querySelector('[data-points]');
      if (st) st.textContent = statusText(f);
      if (sc) sc.textContent = scoreText(f);
      if (pt) pt.textContent = (f.myPoints != null) ? ('+' + f.myPoints + ' pts') : '';
    });
  }

  function updateTable(table, meId) {
    var host = root.querySelector('[data-table] tbody');
    if (!host) return;
    if (!table.length) {
      host.innerHTML = '<tr><td colspan="8" class="muted">No results yet.</td></tr>';
      return;
    }
    host.innerHTML = table.map(function (r) {
      var cls = (r.participantId === meId) ? ' class="me"' : '';
      return '<tr' + cls + '>'
        + '<td>' + r.position + '</td>'
        + '<td class="left">' + escapeHtml(r.name) + '</td>'
        + '<td>' + r.played + '</td>'
        + '<td>' + r.won + '</td>'
        + '<td>' + r.drawn + '</td>'
        + '<td>' + r.lost + '</td>'
        + '<td>' + gd(r.goalDiff) + '</td>'
        + '<td class="pts">' + r.points + '</td>'
        + '</tr>';
    }).join('');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function refresh() {
    fetch('/api/game/' + token + '/state', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        updateFixtures(data.myFixtures || []);
        updateTable(data.table || [], data.me && data.me.id);
      })
      .catch(function () { /* transient; try again next tick */ });
  }

  setInterval(refresh, INTERVAL);
})();

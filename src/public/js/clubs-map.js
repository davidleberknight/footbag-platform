(function () {
  var container = document.getElementById('clubs-map');
  var dataNode = document.getElementById('clubs-map-data');
  var data = null;
  if (dataNode) {
    try { data = JSON.parse(dataNode.textContent); } catch (_e) { data = null; }
  }
  if (!container || !data || !data.length) return;

  var tooltip = document.createElement('div');
  tooltip.className = 'clubs-map-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  fetch('/img/world-map.svg')
    .then(function (r) { return r.text(); })
    .then(function (svgText) {
      container.innerHTML = svgText;
      var svg = container.querySelector('svg');
      if (!svg) return;
      svg.setAttribute('class', 'clubs-map-svg');

      var byCode = {};
      data.forEach(function (d) { if (d.code) byCode[d.code.toUpperCase()] = d; });

      svg.querySelectorAll('path[id]').forEach(function (path) {
        var id = path.getAttribute('id').toUpperCase();
        var entry = byCode[id];
        if (!entry) return;

        path.classList.add('has-clubs');
        // memberBin is a small integer 0-6 driven by the
        // legacy_person_club_affiliations-per-country distribution.
        // CSS classes clubs-map-tier-1..tier-6 carry the sequential
        // green palette. tier-0 falls through to the default has-clubs
        // styling (lit but at the lightest fill).
        if (entry.memberBin >= 1 && entry.memberBin <= 6) {
          path.classList.add('clubs-map-tier-' + entry.memberBin);
        }

        path.addEventListener('mouseenter', function (e) {
          var members = typeof entry.memberCount === 'number' ? entry.memberCount : 0;
          var parts = [
            entry.total + (entry.total === 1 ? ' club' : ' clubs'),
            members + (members === 1 ? ' member' : ' members'),
          ];
          tooltip.textContent = entry.name + ' — ' + parts.join(' · ');
          tooltip.style.display = 'block';
          positionTooltip(e);
        });
        path.addEventListener('mousemove', positionTooltip);
        path.addEventListener('mouseleave', function () {
          tooltip.style.display = 'none';
        });
        path.addEventListener('click', function () {
          window.location.href = '/clubs/' + entry.slug;
        });
      });

      container.removeAttribute('hidden');
      container.removeAttribute('aria-hidden');
    })
    .catch(function () { /* silently degrade — list below still works */ });

  function positionTooltip(e) {
    var x = e.clientX + 14;
    var y = e.clientY - 28;
    if (x + 200 > window.innerWidth) x = e.clientX - 214;
    tooltip.style.left = x + 'px';
    tooltip.style.top  = y + 'px';
  }
})();

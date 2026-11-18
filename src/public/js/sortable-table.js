/**
 * Sortable data tables (progressive enhancement).
 *
 * A `.data-table[data-sortable]` gets a button in each header cell that names
 * a sort type (`data-sort-type="number"` or `"text"`). Activating it reorders
 * the table's rows by that column, ascending, and again descending; the header
 * carries `aria-sort` and the shared sort indicator. Without JavaScript the
 * table reads in the order the server shaped it, which is the useful default
 * (results in place order), so nothing depends on this script.
 *
 * Inert on pages without a sortable table.
 */
(function () {
  var tables = document.querySelectorAll('table.data-table[data-sortable]');
  if (tables.length === 0) return;

  function cellValue(row, index, type) {
    var cell = row.cells[index];
    var text = cell ? cell.textContent.replace(/\s+/g, ' ').trim() : '';
    if (type === 'number') {
      var n = parseFloat(text);
      return isNaN(n) ? Number.POSITIVE_INFINITY : n;
    }
    return text.toLowerCase();
  }

  function sortBy(table, header, index, type) {
    var body = table.tBodies[0];
    if (!body) return;
    var ascending = header.getAttribute('aria-sort') !== 'ascending';
    var rows = Array.prototype.slice.call(body.rows);
    rows.forEach(function (row, i) { row.setAttribute('data-sort-origin', String(i)); });
    rows.sort(function (a, b) {
      var x = cellValue(a, index, type);
      var y = cellValue(b, index, type);
      var order = x < y ? -1 : x > y ? 1 : 0;
      if (order === 0) {
        order = Number(a.getAttribute('data-sort-origin')) - Number(b.getAttribute('data-sort-origin'));
        return order;
      }
      return ascending ? order : -order;
    });
    rows.forEach(function (row) { body.appendChild(row); });

    Array.prototype.forEach.call(table.tHead.rows[0].cells, function (th) {
      th.removeAttribute('aria-sort');
      var old = th.querySelector('.sort-indicator');
      if (old) old.parentNode.removeChild(old);
    });
    header.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
    var indicator = document.createElement('span');
    indicator.className = 'sort-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.textContent = ascending ? '▲' : '▼';
    header.querySelector('button').appendChild(indicator);
  }

  Array.prototype.forEach.call(tables, function (table) {
    if (!table.tHead || !table.tHead.rows[0]) return;
    Array.prototype.forEach.call(table.tHead.rows[0].cells, function (th, index) {
      var type = th.getAttribute('data-sort-type');
      if (!type) return;
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'sort-button';
      while (th.firstChild) button.appendChild(th.firstChild);
      th.appendChild(button);
      button.addEventListener('click', function () { sortBy(table, th, index, type); });
    });
  });
})();

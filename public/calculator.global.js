(function () {
  'use strict';

  // ==================== EXPRESSION ENGINE ====================
  function evaluate(expr) {
    var clean = expr.replace(/\u2212/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/√\(/g, 'Math.sqrt(').replace(/sin\(/g, 'Math.sin(').replace(/cos\(/g, 'Math.cos(')
      .replace(/tan\(/g, 'Math.tan(').replace(/log\(/g, 'Math.log10(').replace(/ln\(/g, 'Math.log(')
      .replace(/\^/g, '**');
    if (!/^[0-9+\-*/().%\s]|Math\./.test(clean) && !clean) throw new Error('Invalid expression');
    if (/[^0-9+\-*/().%\s]/.test(clean.replace(/Math\.(sqrt|sin|cos|tan|log10|log)/g, ''))) throw new Error('Invalid expression');
    // Percentage: treat "50%" as "50/100" (classic calculator behavior)
    var safe = clean.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    if (!safe.trim()) throw new Error('Enter an expression');
    var value = Function('"use strict"; return (' + safe + ')')();
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid result');
    return value;
  }

  function formatResult(value) {
    var rounded = Math.round(value * 1e10) / 1e10;
    return String(rounded);
  }

  // ==================== UNIT CONVERTER ====================
  var UNITS = {
    length: { label: 'Length', units: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 } },
    weight: { label: 'Weight', units: { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523125, t: 1000 } },
    temp: {
      label: 'Temp',
      toBase: function (unit, value) { return unit === 'F' ? (value - 32) * 5 / 9 : unit === 'K' ? value - 273.15 : value; },
      fromBase: function (unit, value) { return unit === 'F' ? value * 9 / 5 + 32 : unit === 'K' ? value + 273.15 : value; },
      units: ['C', 'F', 'K'],
    },
    data: { label: 'Data', units: { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 } },
  };

  var DEFAULT_CATEGORIES = ['length', 'weight', 'temp', 'data'];

  function convertUnit(category, from, to, value) {
    var def = UNITS[category];
    if (!def) return NaN;
    var num = Number(value);
    if (!Number.isFinite(num)) return NaN;
    if (def.units && typeof def.units === 'object' && !Array.isArray(def.units)) {
      if (!(from in def.units) || !(to in def.units)) return NaN;
      return num * def.units[from] / def.units[to];
    }
    if (Array.isArray(def.units) && typeof def.toBase === 'function') {
      if (def.units.indexOf(from) === -1 || def.units.indexOf(to) === -1) return NaN;
      return def.fromBase(to, def.toBase(from, num));
    }
    return NaN;
  }

  // ==================== STATEFUL CALCULATOR ====================
  function createCalculator(container, options) {
    options = options || {};
    var state = {
      expr: '',
      result: '',
      mode: 'basic', // basic | sci | convert
      convCat: 'length',
      convFrom: 'm',
      convTo: 'ft',
      convValue: '1',
    };
    var textarea = options.textarea || null;

    container.innerHTML = markup();
    var el = {
      expr: container.querySelector('.calc-expr'),
      result: container.querySelector('.calc-result'),
      basicKeys: container.querySelector('.calc-keys'),
      sciKeys: container.querySelector('.calc-keys-sci'),
      tabs: container.querySelectorAll('.calc-tab'),
      modeBtns: container.querySelectorAll('.calc-mode-btn'),
      conv: container.querySelector('.calc-convert'),
    };

    function markup() {
      var basicRows = [
        ['C', '( )', '%', '÷'],
        ['7', '8', '9', '×'],
        ['4', '5', '6', '−'],
        ['1', '2', '3', '+'],
        ['0', '.', '⌫', '='],
      ];
      var sciKeys = ['√(', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', 'π', '^'];
      var html = '<div class="calc-header">'
        + '<div class="calc-mode-tabs">'
        + '<button type="button" class="calc-tab" data-mode="basic">Calc</button>'
        + '<button type="button" class="calc-tab" data-mode="convert">Convert</button>'
        + '</div>'
        + '<span class="calc-title">AI Calc</span>'
        + '</div>';

      html += '<div class="calc-panels"><div class="calc-panel" data-panel="calc">';
      html += '<div class="calc-display"><div class="calc-expr"></div><div class="calc-result"></div></div>';
      html += '<div class="calc-keys-sci">' + sciKeys.map(function (key) { return '<button type="button" class="calc-key op" data-key="' + key + '">' + key.replace('(', '') + '</button>'; }).join('') + '</div>';
      html += '<div class="calc-keys">' + basicRows.map(function (row) {
        return row.map(function (key) {
          var cls = 'calc-key';
          if ('÷×−+%'.indexOf(key) !== -1 || key === '( )') cls += ' op';
          if (key === 'C') cls += ' clear';
          if (key === '=') cls += ' equals';
          return '<button type="button" class="' + cls + '" data-key="' + key + '">' + (key === '( )' ? '( )' : key) + '</button>';
        }).join('');
      }).join('') + '</div></div>';

      html += '<div class="calc-panel calc-convert" hidden>' + converterMarkup() + '</div></div>';

      if (textarea) html += '<button type="button" class="calc-insert-btn">Insert into message ↓</button>';
      return html;
    }

    function converterMarkup() {
      var cats = DEFAULT_CATEGORIES.map(function (id) {
        return '<button type="button" class="converter-cat' + (id === state.convCat ? ' active' : '') + '" data-cat="' + id + '">' + UNITS[id].label + '</button>';
      }).join('');
      return '<div class="converter"><div class="converter-cats">' + cats + '</div><div class="converter-body"></div></div>';
    }

    function unitOptions(selected, catId) {
      var def = UNITS[catId];
      var names = Array.isArray(def.units) ? def.units : Object.keys(def.units);
      return names.map(function (name) {
        return '<option value="' + name + '"' + (name === selected ? ' selected' : '') + '>' + name + '</option>';
      }).join('');
    }

    function renderConverter() {
      var body = container.querySelector('.converter-body');
      body.innerHTML = '<div class="converter-row"><div class="converter-field"><label>Value</label><input type="number" class="converter-input conv-value" value="' + state.convValue + '"><select class="converter-select conv-from">' + unitOptions(state.convFrom, state.convCat) + '</select></div><div class="converter-field"><label>Result</label><input type="number" class="converter-input conv-result" value="" readonly><select class="converter-select conv-to">' + unitOptions(state.convTo, state.convCat) + '</select></div></div>';
      var def = UNITS[state.convCat];
      var names = Array.isArray(def.units) ? def.units : Object.keys(def.units);
      if (names.indexOf(state.convFrom) === -1) state.convFrom = names[0];
      if (names.indexOf(state.convTo) === -1) state.convTo = names[1] || names[0];
      container.querySelector('.conv-from').value = state.convFrom;
      container.querySelector('.conv-to').value = state.convTo;
      body.querySelector('.conv-value').addEventListener('input', function (event) {
        state.convValue = event.target.value;
        renderResult();
      });
      body.querySelector('.conv-from').addEventListener('change', function (event) { state.convFrom = event.target.value; renderResult(); });
      body.querySelector('.conv-to').addEventListener('change', function (event) { state.convTo = event.target.value; renderResult(); });
      renderResult();
    }

    function renderResult() {
      var resultInput = container.querySelector('.conv-result');
      if (!resultInput) return;
      var value = convertUnit(state.convCat, state.convFrom, state.convTo, Number(state.convValue));
      resultInput.value = Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : '';
    }

    function render() {
      el.expr.textContent = state.expr || '0';
      el.result.textContent = state.result;
      el.result.classList.toggle('calc-error', /^Error|Invalid|Enter/.test(state.result));
    }

    function press(key) {
      try {
        if (key === 'C') { state.expr = ''; state.result = ''; }
        else if (key === '⌫') { state.expr = state.expr.slice(0, -1); }
        else if (key === '=') { var value = evaluate(state.expr); state.result = formatResult(value); }
        else if (key === '( )') {
          var opens = (state.expr.match(/\(/g) || []).length;
          var closes = (state.expr.match(/\)/g) || []).length;
          state.expr += opens > closes && /[\d)]$/.test(state.expr) ? ')' : '(';
        }
        else if (key === 'π') state.expr += '3.14159265';
        else state.expr += key;
      } catch (error) {
        state.result = error && error.message ? error.message : 'Error';
      }
      render();
    }

    container.addEventListener('click', function (event) {
      var tab = event.target.closest('.calc-tab');
      if (tab) {
        state.mode = tab.dataset.mode;
        el.tabs.forEach(function (item) { item.classList.toggle('active', item === tab); });
        container.querySelectorAll('.calc-panel').forEach(function (panel) { panel.hidden = panel.dataset.panel !== (state.mode === 'convert' ? 'convert' : 'calc'); });
        if (state.mode === 'convert') renderConverter();
        return;
      }
      var cat = event.target.closest('.converter-cat');
      if (cat) {
        state.convCat = cat.dataset.cat;
        var def = UNITS[state.convCat];
        var names = Array.isArray(def.units) ? def.units : Object.keys(def.units);
        state.convFrom = names[0];
        state.convTo = names[1] || names[0];
        container.querySelectorAll('.converter-cat').forEach(function (item) { item.classList.toggle('active', item === cat); });
        renderConverter();
        return;
      }
      var key = event.target.closest('.calc-key');
      if (key) press(key.dataset.key);
    });

    // Evaluate on Enter inside calc display keyboard: no native input, buttons only.
    var insertBtn = container.querySelector('.calc-insert-btn');
    if (insertBtn && textarea) {
      insertBtn.addEventListener('click', function () {
        var value = state.result || evaluate(state.expr);
        if (!Number.isFinite(value)) return;
        var text = formatResult(value);
        textarea.value = textarea.value ? textarea.value + ' ' + text : text;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.focus();
      });
    }
    render();

    return {
      press: press,
      value: function () { return state.result; },
      expression: function () { return state.expr; },
    };
  }

  window.AITutorCalculator = { create: createCalculator, evaluate: evaluate, formatResult: formatResult, convertUnit: convertUnit };
})();

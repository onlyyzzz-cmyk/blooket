(function () {
  'use strict';

  // ==================== EXPRESSION ENGINE ====================
  function evaluate(expr, opts) {
    opts = opts || {};
    var deg = !!opts.deg;
    var clean = String(expr || '')
      .replace(/\u2212/g, '-').replace(/×/g, '*').replace(/÷/g, '/')
      .replace(/√\(/g, 'sqrtH(')
      .replace(/sin\(/g, 'sinH(').replace(/cos\(/g, 'cosH(').replace(/tan\(/g, 'tanH(')
      .replace(/log\(/g, 'logH(').replace(/ln\(/g, 'lnH(')
      .replace(/\^/g, '**');
    if (!clean.trim()) throw new Error('Enter an expression');
    if (/[^0-9+\-*/().%\sA-Za-z_]/.test(clean.replace(/(sqrtH|sinH|cosH|tanH|logH|lnH)\(/g, ''))) throw new Error('Invalid expression');
    // Percentage: treat "50%" as "(50/100)" (classic calculator behavior)
    var safe = clean.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    var value = Function('sqrtH', 'sinH', 'cosH', 'tanH', 'logH', 'lnH', '"use strict"; return (' + safe + ')')(
      Math.sqrt,
      function (x) { return Math.sin(deg ? x * Math.PI / 180 : x); },
      function (x) { return Math.cos(deg ? x * Math.PI / 180 : x); },
      function (x) { return Math.tan(deg ? x * Math.PI / 180 : x); },
      function (x) { return Math.log10(x); },
      Math.log
    );
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid result');
    return value;
  }

  function formatResult(value) {
    var rounded = Math.round(value * 1e10) / 1e10;
    return String(rounded);
  }

  // ==================== UNIT CONVERTER ====================
  var UNIT_LABELS = {
    m: 'Meters', km: 'Kilometers', cm: 'Centimeters', mm: 'Millimeters',
    mi: 'Miles', yd: 'Yards', ft: 'Feet', in: 'Inches',
    kg: 'Kilograms', g: 'Grams', lb: 'Pounds', oz: 'Ounces', t: 'Tonnes',
    C: 'Celsius', F: 'Fahrenheit', K: 'Kelvin',
    B: 'Bytes', KB: 'Kilobytes', MB: 'Megabytes', GB: 'Gigabytes', TB: 'Terabytes',
    'm/s': 'Meters per sec', 'km/h': 'Kilometers per hour', mph: 'Miles per hour', kn: 'Knots', 'ft/s': 'Feet per sec',
    mL: 'Milliliters', L: 'Liters', 'm³': 'Cubic meters', gal: 'Gallons', qt: 'Quarts', cup: 'Cups', 'fl oz': 'Fluid ounces',
    ms: 'Milliseconds', s: 'Seconds', min: 'Minutes', h: 'Hours', day: 'Days', wk: 'Weeks',
  };

  var UNITS = {
    length: { units: { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254 } },
    weight: { units: { kg: 1, g: 0.001, lb: 0.45359237, oz: 0.028349523125, t: 1000 } },
    temp: {
      toBase: function (unit, value) { return unit === 'F' ? (value - 32) * 5 / 9 : unit === 'K' ? value - 273.15 : value; },
      fromBase: function (unit, value) { return unit === 'F' ? value * 9 / 5 + 32 : unit === 'K' ? value + 273.15 : value; },
      units: ['C', 'F', 'K'],
    },
    data: { units: { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 } },
    speed: { units: { 'm/s': 1, 'km/h': 0.2777777778, mph: 0.44704, kn: 0.5144444444, 'ft/s': 0.3048 } },
    volume: { units: { mL: 0.001, L: 1, 'm³': 1000, gal: 3.785411784, qt: 0.946352946, cup: 0.2365882365, 'fl oz': 0.0295735295625 } },
    time: { units: { ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, wk: 604800 } },
  };

  var CATEGORY_LABELS = {
    length: 'Length', weight: 'Weight', temp: 'Temp', data: 'Data',
    speed: 'Speed', volume: 'Volume', time: 'Time',
  };

  var CONV_DEFAULTS = {
    length: ['m', 'ft'], weight: ['kg', 'lb'], temp: ['C', 'F'], data: ['GB', 'MB'],
    speed: ['km/h', 'mph'], volume: ['L', 'gal'], time: ['min', 's'],
  };

  function unitNames(catId) {
    var def = UNITS[catId];
    return Array.isArray(def.units) ? def.units : Object.keys(def.units);
  }

  function convertUnit(category, from, to, value) {
    var def = UNITS[category];
    if (!def) return NaN;
    var num = Number(value);
    if (!Number.isFinite(num)) return NaN;
    if (Array.isArray(def.units)) {
      if (def.units.indexOf(from) === -1 || def.units.indexOf(to) === -1) return NaN;
      return def.fromBase(to, def.toBase(from, num));
    }
    if (!(from in def.units) || !(to in def.units)) return NaN;
    return num * def.units[from] / def.units[to];
  }

  // ==================== STATEFUL CALCULATOR ====================
  function createCalculator(container, options) {
    options = options || {};
    var state = {
      expr: '',
      result: '',
      ans: null,
      angle: 'deg', // deg | rad
      justEvaluated: false,
      history: [],
      convCat: 'length',
      convValue: '1',
    };
    var textarea = options.textarea || null;

    // The calculator owns its markup so every page gets the full feature set.
    container.innerHTML = markup();

    var el = {
      expr: container.querySelector('.calc-expr'),
      result: container.querySelector('.calc-result'),
    };

    function markup() {
      var sciKeys = ['√(', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', 'π', '^', 'Ans'];
      var basicRows = [
        ['C', '( )', '%', '÷'],
        ['7', '8', '9', '×'],
        ['4', '5', '6', '−'],
        ['1', '2', '3', '+'],
        ['0', '.', '⌫', '='],
      ];

      var html = '<div class="calculator">'
        + '<div class="calc-header">'
        + '<div class="calc-mode-tabs">'
        + '<button type="button" class="calc-tab active" data-mode="basic">Calc</button>'
        + '<button type="button" class="calc-tab" data-mode="convert">Convert</button>'
        + '</div>'
        + '<span class="calc-title">AI Calc</span>'
        + '</div>';

      html += '<div class="calc-panels"><div class="calc-panel" data-panel="calc">';
      html += '<div class="calc-display">'
        + '<button type="button" class="calc-copy" title="Copy result">⧉</button>'
        + '<div class="calc-expr">0</div><div class="calc-result"></div>'
        + '</div>';
      html += '<div class="calc-history" hidden></div>';
      html += '<div class="calc-keys-sci">'
        + '<button type="button" class="calc-key op calc-angle" data-key="ANGLE">DEG</button>'
        + sciKeys.map(function (key) {
          return '<button type="button" class="calc-key op" data-key="' + key + '">' + key.replace('(', '') + '</button>';
        }).join('')
        + '</div>';
      html += '<div class="calc-keys">' + basicRows.map(function (row) {
        return row.map(function (key) {
          var cls = 'calc-key';
          if ('÷×−+%'.indexOf(key) !== -1 || key === '( )') cls += ' op';
          if (key === 'C') cls += ' clear';
          if (key === '=') cls += ' equals';
          return '<button type="button" class="' + cls + '" data-key="' + key + '">' + key + '</button>';
        }).join('');
      }).join('') + '</div></div>';

      html += '<div class="calc-panel" data-panel="convert" hidden>' + converterMarkup() + '</div></div>';

      if (textarea) html += '<button type="button" class="calc-insert-btn">Insert into message ↓</button>';
      return html + '</div>';
    }

    function converterMarkup() {
      var cats = Object.keys(UNITS).map(function (id) {
        return '<button type="button" class="converter-cat' + (id === state.convCat ? ' active' : '') + '" data-cat="' + id + '">' + CATEGORY_LABELS[id] + '</button>';
      }).join('');
      return '<div class="converter"><div class="converter-cats">' + cats + '</div><div class="converter-body"></div></div>';
    }

    function unitOptions(selected, catId) {
      return unitNames(catId).map(function (name) {
        var label = (UNIT_LABELS[name] || name) + ' (' + name + ')';
        return '<option value="' + name + '"' + (name === selected ? ' selected' : '') + '>' + label + '</option>';
      }).join('');
    }

    function renderConverter() {
      var body = container.querySelector('.converter-body');
      if (!body) return;
      var defaults = CONV_DEFAULTS[state.convCat] || [];
      var from = defaults[0], to = defaults[1];
      body.innerHTML = '<div class="converter-row">'
        + '<div class="converter-field"><label>From</label><input type="number" class="converter-input conv-value" value="' + state.convValue + '"><select class="converter-select conv-from">' + unitOptions(from, state.convCat) + '</select></div>'
        + '<button type="button" class="converter-swap" title="Swap units">⇄</button>'
        + '<div class="converter-field"><label>To</label><input type="number" class="converter-input conv-result" value="" readonly><select class="converter-select conv-to">' + unitOptions(to, state.convCat) + '</select></div>'
        + '</div>';
      renderResult();
      body.querySelector('.conv-value').addEventListener('input', function (event) {
        state.convValue = event.target.value;
        renderResult();
      });
      body.querySelector('.conv-from').addEventListener('change', function (event) { renderResult(); });
      body.querySelector('.conv-to').addEventListener('change', function (event) { renderResult(); });
      body.querySelector('.converter-swap').addEventListener('click', function () {
        var fromSelect = body.querySelector('.conv-from');
        var toSelect = body.querySelector('.conv-to');
        var swap = fromSelect.value;
        fromSelect.value = toSelect.value;
        toSelect.value = swap;
        renderResult();
      });
    }

    function renderResult() {
      var body = container.querySelector('.converter-body');
      if (!body) return;
      var from = body.querySelector('.conv-from').value;
      var to = body.querySelector('.conv-to').value;
      var resultInput = body.querySelector('.conv-result');
      var value = convertUnit(state.convCat, from, to, Number(state.convValue));
      resultInput.value = Number.isFinite(value) ? String(Math.round(value * 1e6) / 1e6) : '';
    }

    function renderHistory() {
      var wrap = container.querySelector('.calc-history');
      if (!wrap) return;
      if (!state.history.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
      wrap.hidden = false;
      wrap.innerHTML = state.history.map(function (item) {
        return '<button type="button" class="calc-history-chip" data-value="' + item.result + '" title="' + item.expr + ' = ' + item.result + '">' + item.expr + ' = ' + item.result + '</button>';
      }).join('');
    }

    function previewValue() {
      try {
        var value = evaluate(state.expr, { deg: state.angle === 'deg' });
        return Number.isFinite(value) ? formatResult(value) : '';
      } catch (error) { return ''; }
    }

    function render() {
      el.expr.textContent = state.expr || '0';
      var angleBtn = container.querySelector('.calc-angle');
      if (angleBtn) angleBtn.textContent = state.angle.toUpperCase();
      var isError = /^(Error|Invalid|Enter|Copy)/.test(state.result);
      if (state.result) {
        el.result.textContent = state.result;
        el.result.classList.remove('calc-preview');
      } else {
        var preview = previewValue();
        el.result.textContent = preview;
        el.result.classList.toggle('calc-preview', !!preview);
      }
      el.result.classList.toggle('calc-error', isError);
      renderHistory();
    }

    function startOrAppend(fragment) {
      if (state.justEvaluated) {
        var continues = /^[+\-\u00d7\u00f7^%]/.test(fragment);
        state.expr = continues ? formatResult(state.ans) : '';
        state.result = '';
        state.justEvaluated = false;
      }
      state.expr += fragment;
    }

    function press(key) {
      try {
        if (key === 'C') { state.expr = ''; state.result = ''; state.justEvaluated = false; }
        else if (key === '⌫') { state.expr = state.expr.slice(0, -1); state.justEvaluated = false; }
        else if (key === '=') {
          var value = evaluate(state.expr, { deg: state.angle === 'deg' });
          var text = formatResult(value);
          state.ans = value;
          state.result = text;
          state.justEvaluated = true;
          state.history.unshift({ expr: state.expr, result: text });
          state.history = state.history.slice(0, 4);
        }
        else if (key === 'Ans') { if (state.ans !== null) startOrAppend(formatResult(state.ans)); }
        else if (key === 'ANGLE') { state.angle = state.angle === 'deg' ? 'rad' : 'deg'; }
        else if (key === '( )') {
          if (state.justEvaluated) { state.expr = ''; state.result = ''; state.justEvaluated = false; }
          var opens = (state.expr.match(/\(/g) || []).length;
          var closes = (state.expr.match(/\)/g) || []).length;
          state.expr += opens > closes && /[\d)]$/.test(state.expr) ? ')' : '(';
        }
        else if (key === 'π') startOrAppend('3.14159265');
        else startOrAppend(key);
      } catch (error) {
        state.result = error && error.message ? error.message : 'Error';
        state.justEvaluated = false;
      }
      render();
    }

    function flash(message) {
      el.result.textContent = message;
      el.result.classList.remove('calc-preview', 'calc-error');
      setTimeout(render, 1100);
    }

    function onKey(event) {
      if (container.hidden || container.offsetParent === null) return;
      var target = event.target;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)) return;
      var key = event.key;
      if (/^[0-9]$/.test(key)) { press(key); event.preventDefault(); }
      else if (key === '+' || key === '(' || key === ')' || key === '.' || key === '%' || key === '^') { press(key); event.preventDefault(); }
      else if (key === '-') { press('−'); event.preventDefault(); }
      else if (key === '*') { press('×'); event.preventDefault(); }
      else if (key === '/') { press('÷'); event.preventDefault(); }
      else if (key === 'Enter' || key === '=') { press('='); event.preventDefault(); }
      else if (key === 'Backspace') { press('⌫'); event.preventDefault(); }
      else if (key === 'Escape') { press('C'); event.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);

    container.addEventListener('click', function (event) {
      var copy = event.target.closest('.calc-copy');
      if (copy) {
        var text = state.result || previewValue();
        if (text && navigator.clipboard) {
          navigator.clipboard.writeText(text).then(function () { flash('Copied ✓'); }, function () { flash('Copy failed'); });
        } else if (text) { flash(text); }
        return;
      }
      var chip = event.target.closest('.calc-history-chip');
      if (chip) { startOrAppend(chip.dataset.value); render(); return; }
      var tab = event.target.closest('.calc-tab');
      if (tab) {
        container.querySelectorAll('.calc-tab').forEach(function (item) { item.classList.toggle('active', item === tab); });
        var panelId = tab.dataset.mode === 'convert' ? 'convert' : 'calc';
        container.querySelectorAll('.calc-panel').forEach(function (panel) { panel.hidden = panel.dataset.panel !== panelId; });
        if (panelId === 'convert') renderConverter();
        return;
      }
      var cat = event.target.closest('.converter-cat');
      if (cat) {
        state.convCat = cat.dataset.cat;
        container.querySelectorAll('.converter-cat').forEach(function (item) { item.classList.toggle('active', item === cat); });
        renderConverter();
        return;
      }
      var key = event.target.closest('.calc-key');
      if (key) press(key.dataset.key);
    });

    var insertBtn = container.querySelector('.calc-insert-btn');
    if (insertBtn && textarea) {
      insertBtn.addEventListener('click', function () {
        var text = state.result || previewValue();
        if (!text) return;
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

// One-off: generate balanced static calculator markup and patch both page scripts.
const fs = require('fs');

function button(cls, key, label) {
  return '<button type="button" class="' + cls + '" data-key="' + key + '">' + label + '</button>';
}

function buildCalculator() {
  const sci = [
    ['\u221a(', '\u221a'], ['sin(', 'sin'], ['cos(', 'cos'], ['tan(', 'tan'],
    ['log(', 'log'], ['ln(', 'ln'], ['\u03c0', '\u03c0'], ['^', '^'],
  ];
  const rows = [
    [['C', 'C', 'clear'], ['( )', '( )', 'op'], ['%', '%', 'op'], ['\u00f7', '\u00f7', 'op']],
    [['7', '7', ''], ['8', '8', ''], ['9', '9', ''], ['\u00d7', '\u00d7', 'op']],
    [['4', '4', ''], ['5', '5', ''], ['6', '6', ''], ['\u2212', '\u2212', 'op']],
    [['1', '1', ''], ['2', '2', ''], ['3', '3', ''], ['+', '+', 'op']],
    [['0', '0', ''], ['.', '.', ''], ['\u232b', '\u232b', 'op'], ['=', '=', 'equals']],
  ];
  const cats = [
    ['length', 'Length'], ['weight', 'Weight'], ['temp', 'Temp'], ['data', 'Data'],
  ];

  let s = '';
  s += '<div class="calculator">';
  s += '<div class="calc-header">';
  s += '<div class="calc-mode-tabs">';
  s += '<button type="button" class="calc-tab active" data-mode="basic">Calc</button>';
  s += '<button type="button" class="calc-tab" data-mode="convert">Convert</button>';
  s += '</div>';
  s += '<span class="calc-title">AI Calc</span>';
  s += '</div>';
  s += '<div class="calc-panels">';
  s += '<div class="calc-panel" data-panel="calc">';
  s += '<div class="calc-display"><div class="calc-expr">0</div><div class="calc-result"></div></div>';
  s += '<div class="calc-keys-sci">';
  sci.forEach(([k, l]) => { s += button('calc-key op', k, l); });
  s += '</div>';
  s += '<div class="calc-keys">';
  rows.forEach((row) => { row.forEach(([label, key, cls]) => { s += button('calc-key' + (cls ? ' ' + cls : ''), key, label); }); });
  s += '</div>';
  s += '</div>';
  s += '<div class="calc-panel" data-panel="convert" hidden>';
  s += '<div class="converter">';
  s += '<div class="converter-cats">';
  cats.forEach(([id, label]) => { s += '<button type="button" class="converter-cat' + (id === 'length' ? ' active' : '') + '" data-cat="' + id + '">' + label + '</button>'; });
  s += '</div>';
  s += '<div class="converter-body"></div>';
  s += '</div>';
  s += '</div>';
  s += '</div>';
  s += '<button type="button" class="calc-insert-btn">Insert into message \u2193</button>';
  s += '</div>';

  const opens = (s.match(/<div/g) || []).length;
  const closes = (s.match(/<\/div>/g) || []).length;
  if (opens !== closes) throw new Error('unbalanced: ' + opens + ' vs ' + closes);
  return s;
}

const calcHtml = buildCalculator();
const calcEscaped = calcHtml.split('"').join('\\"');

function patch(file, containerId) {
  let src = fs.readFileSync(file, 'utf8');
  // Start: '<div class="<id>" hidden>' where quotes are escaped in source as \"
  const startMarker = containerId + String.fromCharCode(34) + " hidden>";
  const i = src.indexOf(startMarker);
  if (i === -1) throw new Error('start marker not found in ' + file);
  const endMarker = file.includes('chats')
    ? '<div class="input-bar-row"'
    : '<textarea class="input-textarea"';
  const j = src.indexOf(endMarker, i);
  if (j === -1) throw new Error('end marker not found in ' + file);
  const replacement = startMarker + calcEscaped;
  src = src.slice(0, i) + replacement + src.slice(j);
  fs.writeFileSync(file, src);
  console.log('patched', file);
}

patch('public/chats.global.js', 'input-bar-calc');
patch('public/main.global.js', 'input-card-calc');

// verify balance in the generated segments of the final files
for (const file of ['public/chats.global.js', 'public/main.global.js']) {
  const src = fs.readFileSync(file, 'utf8');
  const id = file.includes('chats') ? 'input-bar-calc' : 'input-card-calc';
  const i = src.indexOf(id);
  const t = file.includes('chats')
    ? src.indexOf('<div class="input-bar-row"', i)
    : src.indexOf('<textarea class="input-textarea"', i);
  const block = src.slice(i, t);
  const opens = (block.match(/<div/g) || []).length;
  const closes = (block.match(/<\/div>/g) || []).length;
  console.log(file, 'block balance:', opens, closes, opens === closes ? 'OK' : 'BROKEN');
}

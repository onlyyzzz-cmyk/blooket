import { useEffect, useRef, useState } from 'react';

/* Safe math evaluator for grades 6–12. */

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function tokenize(src: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let num = '';
      while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
      tokens.push(num);
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let word = '';
      while (i < src.length && /[a-zA-Z0-9]/.test(src[i])) word += src[i++];
      tokens.push(word.toLowerCase());
      continue;
    }
    if ('+-*/^()!%,'.includes(c)) { tokens.push(c); i++; continue; }
    throw new Error(`Unexpected character "${c}"`);
  }
  return tokens;
}

function makeParser(tokens: string[], deg: boolean) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

  const FUNCS: Record<string, (...args: number[]) => number> = {
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    ln: Math.log,
    log: Math.log10,
    exp: Math.exp,
    round: Math.round,
    floor: Math.floor,
    ceil: Math.ceil,
    sin: (x) => Math.sin(deg ? (x * Math.PI) / 180 : x),
    cos: (x) => Math.cos(deg ? (x * Math.PI) / 180 : x),
    tan: (x) => Math.tan(deg ? (x * Math.PI) / 180 : x),
    asin: (x) => { const v = Math.asin(x); return deg ? (v * 180) / Math.PI : v; },
    acos: (x) => { const v = Math.acos(x); return deg ? (v * 180) / Math.PI : v; },
    atan: (x) => { const v = Math.atan(x); return deg ? (v * 180) / Math.PI : v; },
  };

  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  function parseTerm(): number {
    let v = parseUnary();
    while (peek() === '*' || peek() === '/' || peek() === '%') {
      const op = next();
      const r = parseUnary();
      if (op === '*') v = v * r;
      else if (op === '/') v = v / r;
      else v = v % r;
    }
    return v;
  }

  function parseUnary(): number {
    if (peek() === '-') { next(); return -parseUnary(); }
    if (peek() === '+') { next(); return parseUnary(); }
    return parsePower();
  }

  function parsePower(): number {
    const base = parsePostfix();
    if (peek() === '^') {
      next();
      const exp = parseUnary();
      return Math.pow(base, exp);
    }
    return base;
  }

  function parsePostfix(): number {
    let v = parsePrimary();
    while (peek() === '!') { next(); v = factorial(v); }
    return v;
  }

  function parseArgs(): number[] {
    const args: number[] = [];
    if (peek() === ')') return args;
    args.push(parseExpr());
    while (peek() === ',') { next(); args.push(parseExpr()); }
    return args;
  }

  function parsePrimary(): number {
    const t = next();
    if (t === undefined) throw new Error('Unexpected end of expression');
    if (/^[0-9.]+$/.test(t)) {
      const n = parseFloat(t);
      if (Number.isNaN(n)) throw new Error(`Invalid number "${t}"`);
      return n;
    }
    if (t === '(') {
      const v = parseExpr();
      if (next() !== ')') throw new Error('Missing closing parenthesis');
      return v;
    }
    if (t in CONSTS) return CONSTS[t];
    if (t in FUNCS) {
      if (next() !== '(') throw new Error(`Expected "(" after ${t}`);
      const args = parseArgs();
      if (next() !== ')') throw new Error('Missing closing parenthesis');
      if (args.length !== 1) throw new Error(`${t} takes 1 argument`);
      return FUNCS[t](args[0]);
    }
    throw new Error(`Unknown symbol "${t}"`);
  }

  return () => {
    const v = parseExpr();
    if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos]}"`);
    return v;
  };
}

export function evaluateMath(src: string, degMode = true): number {
  const cleaned = src.toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens = tokenize(cleaned);
  const run = makeParser(tokens, degMode);
  const value = run();
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) throw new Error('Not a number');
    throw new Error(value > 0 ? 'Infinity' : '-Infinity');
  }
  return value;
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e12)) return n.toExponential(6).replace(/e([+-])(\d)$/, 'e$10$2');
  return String(parseFloat(n.toPrecision(12)));
}

/* ---------------- Unit Converter ---------------- */

type UnitCategory = 'length' | 'weight' | 'temperature' | 'volume' | 'speed' | 'area';

const UNIT_DATA: Record<UnitCategory, { label: string; units: Record<string, { label: string; toBase: (v: number) => number; fromBase: (v: number) => number }> }> = {
  length: {
    label: '📏 Length',
    units: {
      mm: { label: 'Millimeters', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      cm: { label: 'Centimeters', toBase: (v) => v / 100, fromBase: (v) => v * 100 },
      m: { label: 'Meters', toBase: (v) => v, fromBase: (v) => v },
      km: { label: 'Kilometers', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
      in: { label: 'Inches', toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
      ft: { label: 'Feet', toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
      yd: { label: 'Yards', toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
      mi: { label: 'Miles', toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
    },
  },
  weight: {
    label: '⚖️ Weight',
    units: {
      mg: { label: 'Milligrams', toBase: (v) => v / 1000000, fromBase: (v) => v * 1000000 },
      g: { label: 'Grams', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      kg: { label: 'Kilograms', toBase: (v) => v, fromBase: (v) => v },
      oz: { label: 'Ounces', toBase: (v) => v * 0.0283495, fromBase: (v) => v / 0.0283495 },
      lb: { label: 'Pounds', toBase: (v) => v * 0.453592, fromBase: (v) => v / 0.453592 },
      t: { label: 'Metric Tons', toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
    },
  },
  temperature: {
    label: '🌡️ Temperature',
    units: {
      C: { label: 'Celsius', toBase: (v) => v, fromBase: (v) => v },
      F: { label: 'Fahrenheit', toBase: (v) => (v - 32) * 5 / 9, fromBase: (v) => v * 9 / 5 + 32 },
      K: { label: 'Kelvin', toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
    },
  },
  volume: {
    label: '🧪 Volume',
    units: {
      ml: { label: 'Milliliters', toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
      L: { label: 'Liters', toBase: (v) => v, fromBase: (v) => v },
      gal: { label: 'Gallons (US)', toBase: (v) => v * 3.78541, fromBase: (v) => v / 3.78541 },
      qt: { label: 'Quarts', toBase: (v) => v * 0.946353, fromBase: (v) => v / 0.946353 },
      cup: { label: 'Cups', toBase: (v) => v * 0.236588, fromBase: (v) => v / 0.236588 },
      floz: { label: 'Fluid Ounces', toBase: (v) => v * 0.0295735, fromBase: (v) => v / 0.0295735 },
    },
  },
  speed: {
    label: '🚀 Speed',
    units: {
      ms: { label: 'Meters/sec', toBase: (v) => v, fromBase: (v) => v },
      kmh: { label: 'Km/hour', toBase: (v) => v / 3.6, fromBase: (v) => v * 3.6 },
      mph: { label: 'Miles/hour', toBase: (v) => v * 0.44704, fromBase: (v) => v / 0.44704 },
      kn: { label: 'Knots', toBase: (v) => v * 0.514444, fromBase: (v) => v / 0.514444 },
    },
  },
  area: {
    label: '📐 Area',
    units: {
      mm2: { label: 'sq mm', toBase: (v) => v / 1000000, fromBase: (v) => v * 1000000 },
      cm2: { label: 'sq cm', toBase: (v) => v / 10000, fromBase: (v) => v * 10000 },
      m2: { label: 'sq m', toBase: (v) => v, fromBase: (v) => v },
      km2: { label: 'sq km', toBase: (v) => v * 1000000, fromBase: (v) => v / 1000000 },
      in2: { label: 'sq in', toBase: (v) => v * 0.00064516, fromBase: (v) => v / 0.00064516 },
      ft2: { label: 'sq ft', toBase: (v) => v * 0.092903, fromBase: (v) => v / 0.092903 },
      ac: { label: 'Acres', toBase: (v) => v * 4046.86, fromBase: (v) => v / 4046.86 },
    },
  },
};

function UnitConverter({ onInsert }: { onInsert?: (value: string) => void }) {
  const [cat, setCat] = useState<UnitCategory>('length');
  const [fromUnit, setFromUnit] = useState('cm');
  const [toUnit, setToUnit] = useState('in');
  const [inputVal, setInputVal] = useState('1');
  const data = UNIT_DATA[cat];
  const unitKeys = Object.keys(data.units);

  const numVal = parseFloat(inputVal);
  let result = '';
  if (!isNaN(numVal) && unitKeys.includes(fromUnit) && unitKeys.includes(toUnit)) {
    const base = data.units[fromUnit].toBase(numVal);
    const converted = data.units[toUnit].fromBase(base);
    result = formatNumber(converted);
  }

  const switchUnits = () => { setFromUnit(toUnit); setToUnit(fromUnit); };

  return (
    <div className="converter">
      <div className="converter-cats">
        {(Object.keys(UNIT_DATA) as UnitCategory[]).map((k) => (
          <button key={k} className={`converter-cat ${cat === k ? 'active' : ''}`} onClick={() => { setCat(k); const uk = Object.keys(UNIT_DATA[k].units); setFromUnit(uk[0]); setToUnit(uk[1] || uk[0]); }}>
            {UNIT_DATA[k].label}
          </button>
        ))}
      </div>
      <div className="converter-row">
        <div className="converter-field">
          <input type="number" className="converter-input" value={inputVal} onChange={(e) => setInputVal(e.target.value)} placeholder="0" />
          <select className="converter-select" value={fromUnit} onChange={(e) => setFromUnit(e.target.value)}>
            {unitKeys.map((u) => <option key={u} value={u}>{data.units[u].label}</option>)}
          </select>
        </div>
        <button className="converter-swap" onClick={switchUnits} title="Swap">⇄</button>
        <div className="converter-field">
          <div className="converter-result">{result || '—'}</div>
          <select className="converter-select" value={toUnit} onChange={(e) => setToUnit(e.target.value)}>
            {unitKeys.map((u) => <option key={u} value={u}>{data.units[u].label}</option>)}
          </select>
        </div>
      </div>
      {result && onInsert && (
        <button className="calc-insert-btn" onClick={() => onInsert(result)}>Insert into message ↓</button>
      )}
    </div>
  );
}

/* ---------------- UI ---------------- */

const BASIC_KEYS: string[][] = [
  ['7', '8', '9', '÷', 'C'],
  ['4', '5', '6', '×', '⌫'],
  ['1', '2', '3', '−', '( )'],
  ['0', '.', '%', '+', '='],
];

const SCI_KEYS: string[][] = [
  ['x^y', '√', 'x!', 'π', 'e'],
  ['sin', 'cos', 'tan', 'ln', 'log'],
];

export default function Calculator({ onInsert }: { onInsert?: (value: string) => void }) {
  const [expr, setExpr] = useState('');
  const [result, setResult] = useState('');
  const [degMode, setDegMode] = useState(true);
  const [showSci, setShowSci] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'calc' | 'convert'>('calc');
  const pendingParen = useRef(0);

  useEffect(() => { pendingParen.current = 0; }, []);

  const press = (key: string) => {
    setError('');
    if (key === 'C') { setExpr(''); setResult(''); pendingParen.current = 0; return; }
    if (key === '⌫') { setExpr((e) => e.slice(0, -1)); setResult(''); return; }
    if (key === '=') {
      if (!expr.trim()) return;
      try {
        const value = evaluateMath(expr, degMode);
        const formatted = formatNumber(value);
        setResult(formatted);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Invalid expression');
        setResult('');
      }
      return;
    }
    if (key === '( )') {
      const opens = (expr.match(/\(/g) || []).length;
      const closes = (expr.match(/\)/g) || []).length;
      const token = opens > closes ? ')' : '(';
      setExpr((e) => e + token);
      return;
    }
    if (key === 'x^y') { setExpr((e) => e + '^'); return; }
    if (key === '√') { setExpr((e) => e + 'sqrt('); return; }
    if (key === 'x!') { setExpr((e) => e + '!'); return; }
    if (['sin', 'cos', 'tan', 'ln', 'log'].includes(key)) { setExpr((e) => e + key + '('); return; }
    setExpr((e) => e + key);
  };

  const insertResult = () => {
    if (result && onInsert) onInsert(result);
  };

  const displayExpr = expr || '0';

  return (
    <div className="calculator" role="dialog" aria-label="Calculator">
      <div className="calc-header">
        <div className="calc-mode-tabs">
          <button className={`calc-tab ${mode === 'calc' ? 'active' : ''}`} onClick={() => setMode('calc')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><rect x="8" y="6" width="8" height="3" rx="0.5" fill="currentColor" stroke="none"/><line x1="8" y1="13" x2="8.01" y2="13"/><line x1="12" y1="13" x2="12.01" y2="13"/><line x1="16" y1="13" x2="16.01" y2="13"/><line x1="8" y1="17" x2="8.01" y2="17"/><line x1="12" y1="17" x2="12.01" y2="17"/><line x1="16" y1="17" x2="16.01" y2="17"/></svg>
            Calc
          </button>
          <button className={`calc-tab ${mode === 'convert' ? 'active' : ''}`} onClick={() => setMode('convert')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
            Convert
          </button>
        </div>
        {mode === 'calc' && (
          <div className="calc-header-actions">
            <button className={`calc-mode-btn ${degMode ? 'active' : ''}`} onClick={() => setDegMode((d) => !d)} title="Toggle angle mode">{degMode ? 'DEG' : 'RAD'}</button>
            <button className={`calc-mode-btn ${showSci ? 'active' : ''}`} onClick={() => setShowSci((s) => !s)} title="Toggle scientific keys">fx</button>
          </div>
        )}
      </div>

      {mode === 'calc' ? (
        <>
          <div className="calc-display">
            <div className="calc-expr" title={displayExpr}>{displayExpr}</div>
            <div className={`calc-result ${error ? 'calc-error' : ''}`}>
              {error ? error : result ? `= ${result}` : '\u00A0'}
            </div>
          </div>

          {showSci && (
            <div className="calc-keys calc-keys-sci">
              {SCI_KEYS.flat().map((k) => (
                <button key={k} className="calc-key sci" onClick={() => press(k)}>{k}</button>
              ))}
            </div>
          )}

          <div className="calc-keys">
            {BASIC_KEYS.flat().map((k) => (
              <button
                key={k}
                className={`calc-key ${k === '=' ? 'equals' : ''} ${'÷×−+'.includes(k) ? 'op' : ''} ${k === 'C' ? 'clear' : ''}`}
                onClick={() => press(k)}
              >
                {k}
              </button>
            ))}
          </div>

          {result && onInsert && (
            <button className="calc-insert-btn" onClick={insertResult} title="Insert into message">
              Insert into message ↓
            </button>
          )}
        </>
      ) : (
        <UnitConverter onInsert={onInsert} />
      )}
    </div>
  );
}

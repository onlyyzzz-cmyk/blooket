import { useEffect, useRef, useState } from 'react';

/* Safe math evaluator for grades 6–12.
   Supports: + - * / ^ ( ) %, sqrt, cbrt, abs, ln, log, exp,
   sin, cos, tan (radians & deg modes), asin, acos, atan,
   factorial (!), pi, e, and percent (e.g. 50% = 0.5). */

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

/* Recursive descent parser with precedence:
   expr -> term (('+'|'-') term)*
   term -> unary (('*'|'/'|'%') unary)*      % = modulo here
   unary -> ('-'|'+') unary | power
   power -> postfix ('^' unary)?             right-assoc
   postfix -> primary ('!')*
   primary -> number | const | func '(' args ')' | '(' expr ')' | primary '%'  */
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
      const exp = parseUnary(); // right-assoc
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
      // Smart paren: open if it reduces balance, otherwise close.
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
        <span className="calc-title">Calculator</span>
        <div className="calc-header-actions">
          <button
            className={`calc-mode-btn ${degMode ? 'active' : ''}`}
            onClick={() => setDegMode((d) => !d)}
            title="Toggle angle mode"
          >
            {degMode ? 'DEG' : 'RAD'}
          </button>
          <button
            className={`calc-mode-btn ${showSci ? 'active' : ''}`}
            onClick={() => setShowSci((s) => !s)}
            title="Toggle scientific keys"
          >
            fx
          </button>
        </div>
      </div>

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
    </div>
  );
}

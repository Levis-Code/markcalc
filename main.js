/*
 * MarkCalc — ARCHIVO GENERADO. No editar a mano.
 *   Fuentes:  src/engine.js (motor puro, testeable con node) + src/wrapper.js (Obsidian)
 *   Build:    node src/build.js        -> regenera este main.js
 *   Tests:    node src/test/run.js     -> suite del motor (sin dependencias)
 *   Versión:  ver manifest.json
 */

"use strict";

// ==========================================================================
// MarkCalc — motor de cálculo (lógica pura, SIN dependencias externas).
//
// Fórmulas tipo hoja de cálculo en tablas Markdown, donde TANTO las fórmulas
// como los resultados viven en el .md como markdown plano y portable.
//
//   - Fórmulas: en un comentario `<!-- calc: ... -->` debajo de la tabla
//     (invisible en lectura; es la fuente de verdad, se recalcula desde aquí).
//   - Resultados: escritos dentro de las celdas (markdown real).
//   - Funciones de usuario, embebidas en la propia nota (autocontenida):
//       * ```calc-functions  -> definiciones de una línea:  name(args) = expr
//       * ```calc-js         -> JavaScript completo, asigna a `exports`
//
// El lenguaje de las fórmulas es JavaScript (evaluado con `new Function`),
// con una librería de ayudantes (sum, mean, round, ...) inyectada en scope.
// ==========================================================================

'use strict';

// --- ayudantes numéricos disponibles en las fórmulas ---------------------

function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = Number(String(v).trim());
  return isNaN(n) ? 0 : n;
}
function asArray(args) {
  if (args.length === 1 && Array.isArray(args[0])) return args[0];
  return Array.from(args);
}

// ¿el valor `v` cumple el criterio? Criterio: "activo", ">10", "<=5", "!=x"...
function matchCriteria(v, crit) {
  const c = String(crit == null ? '' : crit).trim();
  const m = c.match(/^(>=|<=|!=|>|<|=)(.*)$/);
  if (m) {
    const op = m[1];
    const rhs = m[2].trim();
    const isNumeric = /^-?(\d+(\.\d+)?|\.\d+)$/.test(rhs);
    if (isNumeric) {
      const a = num(v); const b = Number(rhs);
      switch (op) {
        case '>': return a > b; case '<': return a < b;
        case '>=': return a >= b; case '<=': return a <= b;
        case '=': return a === b; case '!=': return a !== b;
      }
    }
    const s = String(v).trim().toLowerCase(); const t = rhs.toLowerCase();
    if (op === '=') return s === t;
    if (op === '!=') return s !== t;
    if (op === '>') return s > t; if (op === '<') return s < t;
    if (op === '>=') return s >= t; if (op === '<=') return s <= t;
  }
  return String(v).trim().toLowerCase() === c.toLowerCase();
}

// Fechas: parseo tolerante y formato ISO local (YYYY-MM-DD).
function parseDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const t = String(v).trim();
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}
function isoDate(d) {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

// Formato numérico con patrón estilo "$#,##0.00" / "0.0%" / "#,##0".
function formatNumber(x, pattern) {
  let n = num(x);
  const pat = String(pattern == null ? '' : pattern);
  const percent = pat.indexOf('%') >= 0;
  if (percent) n *= 100;
  const dm = pat.match(/\.(0+)/);
  const dec = dm ? dm[1].length : 0;
  const grouped = /,/.test(pat);
  const prefix = (pat.match(/^[^#0.,%]*/) || [''])[0];
  const suffix = (pat.match(/[^#0.,%]*$/) || [''])[0];
  let s = Math.abs(n).toFixed(dec);
  if (grouped) {
    const parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    s = parts.join('.');
  }
  return (n < 0 ? '-' : '') + prefix + s + suffix + (percent ? '%' : '');
}

const HELPERS = {
  sum: (...a) => asArray(a).reduce((x, y) => x + num(y), 0),
  mean: (...a) => { const r = asArray(a).map(num); return r.length ? r.reduce((x, y) => x + y, 0) / r.length : 0; },
  avg: (...a) => HELPERS.mean(...a),
  count: (...a) => asArray(a).length,
  product: (...a) => asArray(a).reduce((x, y) => x * num(y), 1),
  min: (...a) => Math.min(...asArray(a).map(num)),
  max: (...a) => Math.max(...asArray(a).map(num)),
  round: (x, n) => { const f = Math.pow(10, n || 0); return Math.round(num(x) * f) / f; },
  floor: (x) => Math.floor(num(x)),
  ceil: (x) => Math.ceil(num(x)),
  abs: (x) => Math.abs(num(x)),
  sqrt: (x) => Math.sqrt(num(x)),
  pow: (x, y) => Math.pow(num(x), num(y)),
  exp: (x) => Math.exp(num(x)),
  log: (x) => Math.log(num(x)),
  log10: (x) => Math.log(num(x)) / Math.LN10,
  IF: (c, a, b) => (c ? a : b),
  iif: (c, a, b) => (c ? a : b),
  PI: Math.PI,
  E: Math.E,

  // --- Agregados condicionales -------------------------------------------
  // sumIf(col("Estado"), "activo", col("Total"))  -> suma Total donde Estado=activo
  sumIf: (condArr, crit, valArr) => {
    condArr = condArr || []; valArr = valArr || condArr;
    let s = 0;
    for (let i = 0; i < condArr.length; i++) if (matchCriteria(condArr[i], crit)) s += num(valArr[i]);
    return s;
  },
  countIf: (condArr, crit) => {
    condArr = condArr || [];
    let c = 0;
    for (let i = 0; i < condArr.length; i++) if (matchCriteria(condArr[i], crit)) c++;
    return c;
  },
  avgIf: (condArr, crit, valArr) => {
    condArr = condArr || []; valArr = valArr || condArr;
    let s = 0; let c = 0;
    for (let i = 0; i < condArr.length; i++) if (matchCriteria(condArr[i], crit)) { s += num(valArr[i]); c++; }
    return c ? s / c : 0;
  },

  // --- Fechas -------------------------------------------------------------
  today: () => isoDate(new Date()),
  days: (a, b) => {
    const pa = parseDate(a); const pb = parseDate(b);
    if (!pa || !pb) return 0;
    return Math.round((pb - pa) / 86400000);
  },
  dateAdd: (a, n) => {
    const pa = parseDate(a);
    if (!pa) return '';
    const d = new Date(pa.getTime());
    d.setDate(d.getDate() + Math.round(num(n)));
    return isoDate(d);
  },
  year: (a) => { const d = parseDate(a); return d ? d.getFullYear() : 0; },
  month: (a) => { const d = parseDate(a); return d ? d.getMonth() + 1 : 0; },
  day: (a) => { const d = parseDate(a); return d ? d.getDate() : 0; },
  weekday: (a) => { const d = parseDate(a); return d ? d.getDay() : 0; }, // 0=domingo

  // --- Formato de salida (devuelven texto) -------------------------------
  thousands: (x, d) => {
    const dec = d == null ? 0 : d;
    const n = num(x);
    const s = Math.abs(n).toFixed(dec).split('.');
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (n < 0 ? '-' : '') + s.join('.');
  },
  money: (x, sym, d) => {
    const dec = d == null ? 2 : d;
    return (num(x) < 0 ? '-' : '') + (sym || '$') + HELPERS.thousands(Math.abs(num(x)), dec);
  },
  percent: (x, d) => HELPERS.round(x, d == null ? 1 : d) + '%', // NO escala (28 -> "28%")
  format: (x, pattern) => formatNumber(x, pattern), // patrón; "%" SÍ escala (0.28 -> "28%")
};

// --- evaluador de expresiones JS con scope -------------------------------

const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if',
  'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'this', 'throw',
  'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'enum', 'await',
  'implements', 'package', 'protected', 'static', 'interface', 'private', 'public',
  'let', 'null', 'true', 'false', 'arguments', 'eval',
]);

function validIdent(k) {
  return /^[A-Za-z_$][\w$]*$/.test(k) && !RESERVED.has(k);
}

function evalExpr(expr, scope) {
  const keys = Object.keys(scope).filter(validIdent);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...keys, '"use strict"; return (' + expr + ');');
  return fn(...keys.map((k) => scope[k]));
}

// --- utilidades de texto / tablas ----------------------------------------

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isSeparator(line) {
  const t = line.trim();
  if (!t.includes('-')) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(t);
}

function isTableStart(lines, i) {
  if (i + 1 >= lines.length) return false;
  if (!/\|/.test(lines[i])) return false;
  if (isSeparator(lines[i])) return false;
  return isSeparator(lines[i + 1]);
}

// nombre de columna -> identificador seguro (insensible a mayúsculas).
function sanitize(name) {
  const s = String(name).trim().toLowerCase().replace(/[^a-z0-9_]/gu,
    (character) => '$' + character.codePointAt(0).toString(16).padStart(6, '0') + '$');
  return '__c_' + s;
}

function coerce(cell) {
  if (cell == null) return 0;
  const t = String(cell).trim();
  if (t === '') return 0;
  if (/^(true|false)$/i.test(t)) return /^true$/i.test(t);
  if (/^-?(\d+(\.\d+)?|\.\d+)$/.test(t)) return Number(t);
  // Número formateado: $ 1,500.00  /  28%  /  1.234,5 -> conserva valor numérico.
  if (/\d/.test(t) && /^[-+]?[\s$€£%\d.,]+$/.test(t)) {
    const cleaned = t.replace(/[\s$€£%]/g, '').replace(/,/g, '');
    if (/^[-+]?(\d+(\.\d+)?|\.\d+)$/.test(cleaned)) return Number(cleaned);
  }
  return t;
}

function formatValue(val, settings) {
  const precision = settings && settings.precision != null ? settings.precision : 6;
  if (typeof val === 'number') {
    if (!isFinite(val)) return String(val);
    if (Number.isInteger(val)) return String(val);
    return val.toFixed(precision).replace(/\.?0+$/, '');
  }
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (val == null) return '';
  if (Array.isArray(val)) return val.map((v) => formatValue(v, settings)).join(', ');
  return String(val);
}

// --- funciones de usuario embebidas en la nota ---------------------------

function extractFenced(content, lang) {
  const out = [];
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^\s*(```+|~~~+)\s*([^\s`]*)/);
    if (m) {
      const fence = m[1];
      const info = (m[2] || '').trim();
      const body = [];
      i++;
      const closer = new RegExp('^\\s*' + fence[0] + '{' + fence.length + ',}\\s*$');
      while (i < lines.length && !closer.test(lines[i])) { body.push(lines[i]); i++; }
      i++; // saltar cierre
      if (info === lang) out.push(body.join('\n'));
      continue;
    }
    i++;
  }
  return out;
}

function makeExprFn(params, body, scopeRef) {
  return function (...args) {
    const local = Object.assign({}, scopeRef);
    params.forEach((p, i) => { local[p] = args[i]; });
    return evalExpr(body, local);
  };
}

// Devuelve el scope base: ayudantes + funciones definidas por el usuario.
function buildUserScope(content, settings) {
  const base = Object.assign({}, HELPERS);

  // 1) ```calc-functions  ->  name(args) = expr   (una por línea)
  for (const block of extractFenced(content, 'calc-functions')) {
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('//')) continue;
      const m = line.match(/^([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*=\s*(.+)$/);
      if (!m) continue;
      const fname = m[1];
      if (!validIdent(fname)) continue;
      const params = m[2].split(',').map((s) => s.trim()).filter(Boolean);
      try {
        base[fname] = makeExprFn(params, m[3].trim(), base);
      } catch (e) {
        if (settings && settings.debug) console.warn('MarkCalc calc-functions:', line, '->', e.message);
      }
    }
  }

  // 2) ```calc-js  ->  JavaScript completo, asigna a `exports`
  if (!settings || settings.enableJsFunctions !== false) {
    for (const block of extractFenced(content, 'calc-js')) {
      try {
        const ex = {};
        // eslint-disable-next-line no-new-func
        const fn = new Function('exports', 'helpers', '"use strict";\n' + block);
        fn(ex, HELPERS);
        for (const k of Object.keys(ex)) {
          if (!validIdent(k)) continue;
          const v = ex[k];
          if (typeof v === 'function' || typeof v === 'number') base[k] = v;
        }
      } catch (e) {
        if (settings && settings.debug) console.warn('MarkCalc calc-js:', e.message);
      }
    }
  }

  return base;
}

// --- parseo / render de tablas -------------------------------------------

function parseTable(lines, start) {
  const header = splitRow(lines[start]);
  const align = splitRow(lines[start + 1]);
  const rows = [];
  let idx = start + 2;
  while (
    idx < lines.length &&
    /\|/.test(lines[idx]) &&
    lines[idx].trim() !== '' &&
    !isSeparator(lines[idx])
  ) {
    rows.push(splitRow(lines[idx]));
    idx++;
  }
  return { header, align, rows, startIdx: start, endIdx: idx - 1 };
}

const WIDE = new RegExp(
  String.raw`[
    /* Fullwidth spaces, CJK punctuation, CJK radicals and strokes */
    \u{2e80}-\u{2ef3}\u{2f00}-\u{2fd5}\u{2ff0}-\u{2fff}\u{3000}-\u{303f}

    /* Japanese hiragana, katakana, bopomofo, and Korean compatibility letters */
    \u{3040}-\u{30ff}\u{3100}-\u{312f}\u{3130}-\u{318f}\u{3190}-\u{31ef}

    /* Enclosed CJK characters, CJK compatibility square units, and CJK Extension A */
    \u{3200}-\u{32ff}\u{3300}-\u{33ff}\u{3400}-\u{4dbf}\u{4e00}-\u{9fff}

    /* Korean syllables, CJK compatibility ideographs */
    \u{ac00}-\u{d7af}\u{f900}-\u{faff}

    /* Vertical punctuation forms and CJK compatibility punctuation forms */
    \u{fe10}-\u{fe1f}\u{fe30}-\u{fe4f}\u{fe50}-\u{fe6f}

    /* Fullwidth ASCII, fullwidth letters/digits, fullwidth symbols, and fullwidth currency */
    \u{ff01}-\u{ff60}\u{ffe0}-\u{ffe6}

    /* CJK Unified Ideographs Extensions B-G and other supplementary ideographs */
    \u{20000}-\u{2fffd}\u{30000}-\u{3fffd}
  ]`
    .replace(/\/\*[\s\S]*?\*\//g, '') // Strip comments
    .replace(/\s+/g, ''),              // Strip whitespace and newlines
  'u'
);
const HALFWIDTH = /[\uff61-\uffdc\uffe8-\uffed]/u;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function isEmojiGrapheme(segment) {
  // Keycap sequence (e.g. U+20E3 after digit / # / *): emoji grapheme, width 2
  if (/^[0-9#*]\ufe0f?\u20e3$/u.test(segment)) return true;
  let pictographCount = 0;
  let regionalCount = 0;
  for (const character of segment) {
    // \p{Extended_Pictographic}: pictographic emoji (incl. default text-style ones); for counting
    if (/\p{Extended_Pictographic}/u.test(character)) pictographCount++;
    // \p{Regional_Indicator}: flag regional indicator (e.g. two regional indicator letters)
    if (/\p{Regional_Indicator}/u.test(character)) regionalCount++;
  }
  return regionalCount >= 2 ||
    (pictographCount >= 2 && segment.includes('\u200d')) ||
    // \p{Emoji_Presentation} or variation selector \uFE0F: rendered as emoji
    (pictographCount > 0 && (/\p{Emoji_Presentation}/u.test(segment) || segment.includes('\ufe0f')));
}

function graphemeWidth(segment) {
  // Control and zero-width/invisible chars (ZWJ, variation selectors, combining marks) do not affect display width
  const visible = [...segment].filter((character) => !/\p{Control}/u.test(character) && !/[\p{Default_Ignorable_Code_Point}\p{Format}\p{Mark}]/u.test(character));
  if (visible.length === 0) return 0;
  if (isEmojiGrapheme(segment)) return 2;
  let width = 0;
  for (const character of visible) {
    if (WIDE.test(character)) width += 2;
    else if (HALFWIDTH.test(character)) width += 1;
  }
  if (width === 0) width = 1; // Latin and other narrow visible characters.
  return width;
}

function displayWidth(text) {
  if (!text) return 0;
  if (/^[\x20-\x7e]*$/.test(text)) return text.length;
  let width = 0;
  for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) width += graphemeWidth(segment);
  return width;
}

function renderTable(table) {
  const ncol = table.header.length;
  const norm = (arr) => {
    const r = arr.slice(0, ncol).map((c) => String(c).trim());
    while (r.length < ncol) r.push('');
    return r;
  };
  const header = norm(table.header);
  const rows = table.rows.map(norm);
  const aligns = norm(table.align).map((a) => {
    const x = a.trim();
    const left = x.startsWith(':');
    const right = x.endsWith(':');
    if (left && right) return 'c';
    if (right) return 'r';
    if (left) return 'l';
    return '';
  });
  const widths = header.map((h, i) => Math.max(3, displayWidth(h), ...rows.map((r) => displayWidth(r[i]))));
  const pad = (s, w, al) => {
    const total = w - displayWidth(s);
    if (total <= 0) return s;
    if (al === 'r') return ' '.repeat(total) + s;
    if (al === 'c') { const l = Math.floor(total / 2); return ' '.repeat(l) + s + ' '.repeat(total - l); }
    return s + ' '.repeat(total);
  };
  const sep = aligns.map((al, i) => {
    const w = widths[i];
    if (al === 'c') return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
    if (al === 'r') return '-'.repeat(Math.max(1, w - 1)) + ':';
    if (al === 'l') return ':' + '-'.repeat(Math.max(1, w - 1));
    return '-'.repeat(w);
  });
  const out = [];
  out.push('| ' + header.map((h, i) => pad(h, widths[i], aligns[i])).join(' | ') + ' |');
  out.push('| ' + sep.join(' | ') + ' |');
  for (const r of rows) out.push('| ' + r.map((c, i) => pad(c, widths[i], aligns[i])).join(' | ') + ' |');
  return out;
}

// --- aplicación de fórmulas ----------------------------------------------

// Analiza una fórmula y devuelve su estructura, o null si no es válida.
//   - columna:  $Col = expr        -> se aplica a TODAS las filas
//   - celda:    Col(N) = expr       -> se aplica solo a la fila N (1-based)
//               ${Col con espacios}(N) = expr
//               cell("Col", N) = expr     (universal, cualquier nombre)
function parseFormula(f) {
  f = f.trim();
  let m;
  // @name = ventas  -> nombra la tabla para poder consultarla desde otra (misma nota)
  m = f.match(/^@name\s*=\s*([A-Za-z_][\w-]*)$/i);
  if (m) return { kind: 'name', name: m[1].trim() };
  m = f.match(/^cell\(\s*["']([^"']+)["']\s*,\s*(\d+)\s*\)\s*=\s*([\s\S]+)$/i);
  if (m) return { kind: 'cell', colName: m[1].trim(), rowN: +m[2], expr: m[3].trim() };
  m = f.match(/^\$\{([^}]+)\}\s*\(\s*(\d+)\s*\)\s*=\s*([\s\S]+)$/);
  if (m) return { kind: 'cell', colName: m[1].trim(), rowN: +m[2], expr: m[3].trim() };
  m = f.match(/^([A-Za-z_][\w]*)\s*\(\s*(\d+)\s*\)\s*=\s*([\s\S]+)$/);
  if (m) return { kind: 'cell', colName: m[1].trim(), rowN: +m[2], expr: m[3].trim() };
  m = f.match(/^\$\{([^}]+)\}\s*=\s*([\s\S]+)$/);
  if (m) return { kind: 'col', colName: m[1].trim(), expr: m[2].trim() };
  m = f.match(/^\$([A-Za-z_][\w]*)\s*=\s*([\s\S]+)$/);
  if (m) return { kind: 'col', colName: m[1].trim(), expr: m[2].trim() };
  m = f.match(/^([A-Za-z_][\w]*)\s*=\s*([\s\S]+)$/);
  if (m) return { kind: 'col', colName: m[1].trim(), expr: m[2].trim() };
  return null;
}

function applyFormulas(table, formulas, userScope, settings, namedTables, externalTables) {
  namedTables = namedTables || {};
  externalTables = externalTables || {};
  const ncol = table.header.length;
  const colIndex = {};
  table.header.forEach((h, idx) => { colIndex[h.trim().toLowerCase()] = idx; });

  const parsed = formulas.map(parseFormula).filter(Boolean);

  // Nombre de la tabla (para consultas cruzadas dentro de la misma nota).
  for (const f of parsed) if (f.kind === 'name') table.__name = f.name;

  // Auto-expansión: crea filas en blanco hasta la fila destino más alta.
  let maxRow = table.rows.length;
  for (const f of parsed) if (f.kind === 'cell') maxRow = Math.max(maxRow, f.rowN);
  table.rows = table.rows.map((r) => {
    const c = r.slice(0, ncol);
    while (c.length < ncol) c.push('');
    return c;
  });
  while (table.rows.length < maxRow) table.rows.push(new Array(ncol).fill(''));

  // cell("Col", N) -> valor de una celda concreta (1-based). Fuera de rango: 0.
  const cellVal = (name, n) => {
    const idx = colIndex[String(name).trim().toLowerCase()];
    if (idx === undefined) return 0;
    const r = table.rows[n - 1];
    return r ? coerce(r[idx]) : 0;
  };
  // col("Col") -> array de toda la columna (para agregados: sum, mean, ...)
  const colArray = (name) => {
    const idx = colIndex[String(name).trim().toLowerCase()];
    if (idx === undefined) return [];
    return table.rows.map((r) => coerce(r[idx]));
  };

  const looseEq = (a, b) => {
    if (typeof a === 'number' || typeof b === 'number') return num(a) === num(b);
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  };
  const idxOf = (t, name) => {
    const map = {};
    t.header.forEach((h, i) => { map[h.trim().toLowerCase()] = i; });
    return map[String(name).trim().toLowerCase()];
  };
  // lookup(keyCol, keyVal, retCol) -> busca en ESTA tabla la fila con keyCol=keyVal
  // y devuelve retCol. Insensible a may./min.
  const lookup = (keyCol, keyVal, retCol) => {
    const ki = colIndex[String(keyCol).trim().toLowerCase()];
    const ri = colIndex[String(retCol).trim().toLowerCase()];
    if (ki === undefined || ri === undefined) return 0;
    for (const r of table.rows) if (looseEq(coerce(r[ki]), keyVal)) return coerce(r[ri]);
    return 0;
  };
  // Consultas a OTRA tabla nombrada de la MISMA nota (definida más arriba).
  const tcol = (tname, col) => {
    const t = namedTables[tname]; if (!t) return [];
    const ci = idxOf(t, col); if (ci === undefined) return [];
    return t.rows.map((r) => coerce(r[ci]));
  };
  const tcell = (tname, col, n) => {
    const t = namedTables[tname]; if (!t) return 0;
    const ci = idxOf(t, col); if (ci === undefined) return 0;
    const r = t.rows[n - 1]; return r ? coerce(r[ci]) : 0;
  };
  const tlookup = (tname, keyCol, keyVal, retCol) => {
    const t = namedTables[tname]; if (!t) return 0;
    const ki = idxOf(t, keyCol); const ri = idxOf(t, retCol);
    if (ki === undefined || ri === undefined) return 0;
    for (const r of t.rows) if (looseEq(coerce(r[ki]), keyVal)) return coerce(r[ri]);
    return 0;
  };

  // --- Consultas a OTRA NOTA (cross-note) ---------------------------------
  // La tabla se identifica por @name; la nota por su nombre (string). Se
  // resuelve desde externalTables, que el wrapper precarga (async) leyendo los
  // valores YA escritos en esa nota. Si la nota/tabla no está, degrada a 0/[].
  //   xcell("Nota","tabla","Col",N)   xcol("Nota","tabla","Col")
  //   xlookup("Nota","tabla",keyCol,keyVal,retCol)   xfm("Nota","clave")
  const xtab = (note, tname) => {
    const d = externalTables[normNote(note)];
    if (!d || !d.tables) return null;
    return d.tables[String(tname).trim().toLowerCase()] || null;
  };
  const xcell = (note, tname, col, n) => {
    const t = xtab(note, tname); if (!t) return 0;
    const ci = idxOf(t, col); if (ci === undefined) return 0;
    const r = t.rows[n - 1]; return r ? coerce(r[ci]) : 0;
  };
  const xcol = (note, tname, col) => {
    const t = xtab(note, tname); if (!t) return [];
    const ci = idxOf(t, col); if (ci === undefined) return [];
    return t.rows.map((r) => coerce(r[ci]));
  };
  const xlookup = (note, tname, keyCol, keyVal, retCol) => {
    const t = xtab(note, tname); if (!t) return 0;
    const ki = idxOf(t, keyCol); const ri = idxOf(t, retCol);
    if (ki === undefined || ri === undefined) return 0;
    for (const r of t.rows) if (looseEq(coerce(r[ki]), keyVal)) return coerce(r[ri]);
    return 0;
  };
  const xfm = (note, key) => {
    const d = externalTables[normNote(note)];
    if (!d || !d.fm) return 0;
    const v = d.fm[String(key).trim().toLowerCase()];
    return v == null ? 0 : coerce(v);
  };

  // $Col -> variable segura ; Col(N) -> cell("Col", N) si Col es una columna.
  const transform = (expr) => {
    let e = expr.replace(/\$\{([^}]+)\}|\$([A-Za-z0-9_]+)/g, (mm, g1, g2) => sanitize(g1 || g2));
    e = e.replace(/([A-Za-z_][\w]*)\s*\(\s*(\d+)\s*\)/g, (mm, name, n) =>
      colIndex[name.toLowerCase()] !== undefined ? 'cell("' + name + '",' + n + ')' : mm
    );
    return e;
  };

  const scopeFor = (rowIdx) => {
    const n = rowIdx + 1; // número de fila actual (1-based)
    // Referencias RELATIVAS a la fila actual:
    //   up("Col")    -> fila anterior      down("Col")    -> fila siguiente
    //   up("Col", k) -> k filas arriba     down("Col", k) -> k filas abajo
    const up = (name, k) => cellVal(name, n - (k == null ? 1 : k));
    const down = (name, k) => cellVal(name, n + (k == null ? 1 : k));
    // runningSum("Col") -> suma acumulada de la columna desde la fila 1 hasta la actual.
    const runningSum = (name) => {
      let s = 0;
      for (let i = 1; i <= n; i++) s += num(cellVal(name, i));
      return s;
    };
    const scope = Object.assign({}, userScope, {
      col: colArray, cell: cellVal, up, down, prev: up, next: down, runningSum, row: n,
      lookup, tcol, tcell, tlookup,
      xcell, xcol, xlookup, xfm,
    });
    const r = table.rows[rowIdx];
    if (r) table.header.forEach((h, ci) => { scope[sanitize(h)] = coerce(r[ci]); });
    return scope;
  };

  const writeCell = (rowIdx, colIdx, tExpr, original) => {
    if (rowIdx < 0 || !table.rows[rowIdx]) return;
    try {
      const val = evalExpr(tExpr, scopeFor(rowIdx));
      if (typeof val !== 'function' && typeof val !== 'undefined') {
        table.rows[rowIdx][colIdx] = formatValue(val, settings);
      }
    } catch (e) {
      if (settings && settings.debug) console.warn('MarkCalc fórmula:', original, '->', e.message);
      // en error: deja el valor existente, no corrompe la celda
    }
  };

  // Las fórmulas se aplican en orden: una celda puede usar resultados previos.
  for (const f of parsed) {
    if (f.kind === 'name') continue;
    const targetIdx = colIndex[f.colName.toLowerCase()];
    if (targetIdx === undefined) continue;
    const tExpr = transform(f.expr);
    if (f.kind === 'col') {
      for (let rIdx = 0; rIdx < table.rows.length; rIdx++) writeCell(rIdx, targetIdx, tExpr, f.expr);
    } else {
      writeCell(f.rowN - 1, targetIdx, tExpr, f.expr);
    }
  }
}

// --- procesamiento del documento completo --------------------------------

// Lee el frontmatter YAML (escalares) del inicio de la nota: { clave: valor }.
function parseFrontmatter(content) {
  const lines = content.split('\n');
  if (!lines.length || lines[0].trim() !== '---') return {};
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') break;
    const m = lines[i].match(/^([A-Za-z0-9_\- ]+):\s*(.*)$/);
    if (m) map[m[1].trim().toLowerCase()] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return map;
}

// --- referencias entre notas (cross-note) --------------------------------

// Normaliza el nombre de una nota a una clave estable: basename en minúsculas,
// sin ruta ni extensión. Se usa IGUAL en el wrapper (al indexar/resolver) y en
// el motor (al buscar xcell), para que las claves coincidan.
function normNote(s) {
  // CONSERVA la ruta (no reduce a basename): así "A/Informe" y "B/Informe" son
  // claves distintas y no colisionan. Para refs por basename ("Informe") la
  // resolución a archivo la hace el wrapper con getFirstLinkpathDest.
  return String(s == null ? '' : s).trim().toLowerCase()
    .replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.md$/, '');
}

// Notas referenciadas por xcell/xcol/xlookup/xfm (nombres crudos). Mira SOLO
// dentro de los comentarios <!-- calc: ... --> (donde viven las fórmulas reales)
// y tras quitar los bloques de código, para no capturar ejemplos en prosa o en
// fences (que citan xcell(...) como documentación, no como referencia real).
function scanExternalRefs(content) {
  const set = new Set();
  const noCode = String(content == null ? '' : content)
    .replace(/(^|\n)([ \t]*)(```+|~~~+)[\s\S]*?\n\2?\3[^\n]*/g, '\n');
  const comments = noCode.match(/<!--\s*calc:[\s\S]*?-->/gi) || [];
  const re = /\bx(?:cell|col|lookup|fm)\s*\(\s*["']([^"']+)["']/g;
  for (const block of comments) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(block))) set.add(m[1]);
  }
  return set;
}

// Extrae de UNA nota sus tablas con @name y su frontmatter, para consultarlas
// desde otra nota. Devuelve { tables: { nombre: {header, rows} }, fm: {...} }.
// Lee los valores YA escritos en el markdown (no re-evalúa lógica): portable.
function extractNoteData(content) {
  const fm = parseFrontmatter(content);
  const tables = {};
  const lines = content.split('\n');
  let i = 0;
  let inFence = false;
  while (i < lines.length) {
    if (/^\s*(```+|~~~+)/.test(lines[i])) { inFence = !inFence; i++; continue; }
    if (!inFence && isTableStart(lines, i)) {
      const table = parseTable(lines, i);
      let j = table.endIdx + 1;
      let name = null;
      while (j < lines.length) {
        if (lines[j].trim() === '') { j++; continue; }
        if (!/^\s*<!--\s*calc:/.test(lines[j])) break;
        let k = j;
        const buf = [];
        while (k < lines.length) { buf.push(lines[k]); if (/-->/.test(lines[k])) break; k++; }
        if (k >= lines.length) break;
        const inner = buf.join('\n').replace(/^\s*<!--\s*calc:/, '').replace(/-->\s*$/, '');
        for (const part of inner.split(/;|\n/)) {
          const mm = part.trim().match(/^@name\s*=\s*([A-Za-z_][\w-]*)$/i);
          if (mm) name = mm[1].trim();
        }
        j = k + 1;
      }
      if (name) tables[name.toLowerCase()] = { header: table.header, rows: table.rows };
      i = table.endIdx + 1;
      continue;
    }
    i++;
  }
  return { tables, fm };
}

// --- grafo de dependencias en el frontmatter (padres como wikilinks) -----

// Destinos de wikilinks "[[Nota]]" / "[[Nota|alias]]" presentes en un texto.
function parseWikilinks(s) {
  const out = [];
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(String(s == null ? '' : s)))) out.push(m[1].trim());
  return out;
}

// Lee los nombres de nota de la propiedad `padres` del frontmatter. Soporta
// lista en bloque ("  - "[[A]]"") e inline ("padres: ["[[A]]", "[[B]]"]").
function readParents(content) {
  const lines = content.split('\n');
  if (!lines.length || lines[0].trim() !== '---') return [];
  let end = -1;
  for (let i = 1; i < lines.length; i++) { if (lines[i].trim() === '---') { end = i; break; } }
  if (end === -1) return [];
  const out = [];
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^padres\s*:\s*(.*)$/i);
    if (!m) continue;
    const inline = m[1].trim();
    if (inline) {
      const wl = parseWikilinks(inline);
      if (wl.length) wl.forEach((x) => out.push(x));
      else inline.replace(/^\[|\]$/g, '').split(',').forEach((p) => {
        const t = p.trim().replace(/^["']|["']$/g, '');
        if (t) out.push(t);
      });
    }
    let j = i + 1;
    while (j < end && /^\s*-\s+/.test(lines[j])) {
      const item = lines[j].replace(/^\s*-\s+/, '').trim();
      const wl = parseWikilinks(item);
      if (wl.length) wl.forEach((x) => out.push(x));
      else out.push(item.replace(/^["']|["']$/g, ''));
      j++;
    }
    break;
  }
  return out;
}

// Inserta/actualiza la propiedad `padres` (lista de wikilinks) en el frontmatter,
// derivada de las notas que esta referencia. Si no hay ninguna, quita la clave (y
// el bloque si queda vacío). Idempotente: si el conjunto no cambia, devuelve el
// contenido tal cual (no reescribe ni desplaza líneas).
function upsertParents(content, parentNames) {
  const seen = new Set();
  const list = [];
  for (const n of parentNames || []) {
    const k = normNote(n);
    if (k && !seen.has(k)) { seen.add(k); list.push(String(n).trim()); }
  }
  list.sort((a, b) => a.localeCompare(b));

  const cur = readParents(content).slice().sort((a, b) => a.localeCompare(b));
  const same = cur.length === list.length &&
    cur.map(normNote).join('|') === list.map(normNote).join('|');
  if (same) return content;

  const lines = content.split('\n');
  const hasFm = lines.length > 0 && lines[0].trim() === '---';
  let end = -1;
  if (hasFm) { for (let i = 1; i < lines.length; i++) { if (lines[i].trim() === '---') { end = i; break; } } }
  const block = list.length ? ['padres:', ...list.map((n) => '  - "[[' + n + ']]"')] : [];

  if (hasFm && end !== -1) {
    const fm = lines.slice(1, end);
    const cleaned = [];
    for (let i = 0; i < fm.length; i++) {
      if (/^padres\s*:/i.test(fm[i])) {
        let j = i + 1;
        while (j < fm.length && /^\s*-\s+/.test(fm[j])) j++;
        i = j - 1;
        continue;
      }
      cleaned.push(fm[i]);
    }
    const newFm = cleaned.concat(block);
    if (newFm.length === 0) return lines.slice(end + 1).join('\n').replace(/^\n+/, '');
    return ['---', ...newFm, '---', ...lines.slice(end + 1)].join('\n');
  }
  if (block.length) return ['---', ...block, '---', '', ...lines].join('\n');
  return content;
}

function processContent(content, settings, externalTables) {
  settings = settings || {};
  const userScope = buildUserScope(content, settings);

  // fm("clave") -> valor del frontmatter de ESTA nota (constantes: IVA, tipo cambio...).
  const fmMap = parseFrontmatter(content);
  userScope.fm = (k) => {
    const v = fmMap[String(k).trim().toLowerCase()];
    return v == null ? 0 : coerce(v);
  };

  const namedTables = {}; // tablas nombradas con @name (consultables más abajo)
  const lines = content.split('\n');
  const result = [];
  let i = 0;
  let inFence = false;

  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*(```+|~~~+)/.test(line)) {
      inFence = !inFence;
      result.push(line);
      i++;
      continue;
    }

    if (!inFence && isTableStart(lines, i)) {
      const table = parseTable(lines, i);
      let j = table.endIdx + 1;
      const formulas = [];
      const commentLines = [];
      while (j < lines.length) {
        // Permite saltar líneas en blanco entre la tabla y el comentario.
        if (lines[j].trim() === '') { commentLines.push(lines[j]); j++; continue; }
        if (!/^\s*<!--\s*calc:/.test(lines[j])) break;
        // Comentario `<!-- calc: ... -->` que puede abarcar VARIAS líneas.
        let k = j;
        const buf = [];
        while (k < lines.length) {
          buf.push(lines[k]);
          if (/-->/.test(lines[k])) break;
          k++;
        }
        if (k >= lines.length) break; // comentario sin cierre: ignora
        const inner = buf.join('\n')
          .replace(/^\s*<!--\s*calc:/, '')
          .replace(/-->\s*$/, '');
        formulas.push(...inner.split(/;|\n/).map((s) => s.trim()).filter(Boolean));
        for (let x = j; x <= k; x++) commentLines.push(lines[x]);
        j = k + 1;
      }
      // Si solo había líneas en blanco (sin comentario calc), no es una tabla calc.
      if (formulas.length === 0) {
        for (let k = table.startIdx; k <= table.endIdx; k++) result.push(lines[k]);
        i = table.endIdx + 1;
        continue;
      }

      if (formulas.length) {
        applyFormulas(table, formulas, userScope, settings, namedTables, externalTables);
        if (table.__name) namedTables[table.__name] = table; // disponible para tablas siguientes
        result.push(...renderTable(table));
        for (const c of commentLines) result.push(c);
        i = j;
        continue;
      }
      for (let k = table.startIdx; k <= table.endIdx; k++) result.push(lines[k]);
      i = table.endIdx + 1;
      continue;
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

// Mapea la columna del cursor de la línea vieja a la nueva tras reformatear la
// tabla. Ancla en la celda (texto entre '|') y en el offset DENTRO del texto sin
// padding; así el cursor sobrevive a cambios de ancho de columna. La celda que
// editas no cambia de contenido, solo de padding, por eso el offset se conserva.
function remapCursorCh(oldLine, newLine, ch) {
  const bars = (s) => {
    const pos = [];
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '|' && (i === 0 || s[i - 1] !== '\\')) pos.push(i);
    }
    return pos;
  };
  const op = bars(oldLine);
  const np = bars(newLine);
  // Sin la misma estructura de celdas no se puede mapear con seguridad.
  if (op.length < 2 || op.length !== np.length) return Math.min(ch, newLine.length);

  // Localiza la celda que contiene el cursor: op[m] < ch <= op[m+1].
  let m = -1;
  for (let k = 0; k < op.length - 1; k++) {
    if (ch > op[k] && ch <= op[k + 1]) { m = k; break; }
  }
  if (m === -1) return Math.min(ch, newLine.length); // cursor fuera de las celdas

  const cellStart = op[m] + 1;
  const cellText = oldLine.slice(cellStart, op[m + 1]);
  const lead = cellText.length - cellText.replace(/^ +/, '').length;
  const trimmedLen = cellText.trim().length;
  let trimOff = ch - (cellStart + lead);
  if (trimOff < 0) trimOff = 0;
  if (trimOff > trimmedLen) trimOff = trimmedLen;

  const nStart = np[m] + 1;
  const nCell = newLine.slice(nStart, np[m + 1]);
  const nLead = nCell.length - nCell.replace(/^ +/, '').length;
  let newCh = nStart + nLead + trimOff;
  if (newCh < nStart) newCh = nStart;
  if (newCh > np[m + 1]) newCh = np[m + 1];
  return newCh;
}

// --- ayudas del editor: detección de contexto dentro de <!-- calc: --> ----

// ¿El texto ANTERIOR al cursor termina dentro de un comentario calc abierto?
function mcInCalc(before) {
  const open = before.lastIndexOf('<!-- calc:');
  if (open === -1) return false;
  return before.indexOf('-->', open) === -1;
}

// Columnas (cabecera) de la tabla inmediatamente encima del comentario calc cuyo
// cuerpo contiene `fromLine`. lineAt(i) -> texto de la línea i (o undefined).
function mcColumnsAbove(lineAt, fromLine) {
  let i = fromLine;
  while (i >= 0 && (lineAt(i) || '').indexOf('<!-- calc:') === -1) i--;
  i--; // línea encima del comentario
  while (i >= 0 && (lineAt(i) || '').trim() === '') i--;
  const tbl = [];
  while (i >= 0 && (lineAt(i) || '').indexOf('|') !== -1) { tbl.unshift(lineAt(i)); i--; }
  if (tbl.length < 2) return [];
  return splitRow(tbl[0]).filter(Boolean);
}

// Nombres de tablas con @name presentes en el texto (para tcol/tcell/tlookup).
function mcLocalNames(text) {
  const out = [];
  const re = /@name\s*=\s*([A-Za-z_][\w-]*)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

// Llamada de función que ENCIERRA el final de `text` (cursor). Devuelve la función,
// el índice del argumento actual, si el cursor está dentro de un string, y los
// argumentos previos ya escritos (valor del literal string si lo eran). El
// contexto se saca así de la propia fórmula. Ignora paréntesis/comas en strings.
function mcEnclosingCall(text) {
  const stack = [];
  let s = false, q = '';
  for (let k = 0; k < text.length; k++) {
    const c = text[k];
    if (s) { if (c === q && text[k - 1] !== '\\') s = false; continue; }
    if (c === '"' || c === "'") { s = true; q = c; continue; }
    if (c === '(') {
      const nm = (text.slice(0, k).match(/([A-Za-z_$][\w$]*)\s*$/) || [])[1] || '';
      stack.push({ name: nm, args: [], curStart: k + 1 });
    } else if (c === ')') {
      stack.pop();
    } else if (c === ',' && stack.length) {
      const top = stack[stack.length - 1];
      top.args.push(text.slice(top.curStart, k));
      top.curStart = k + 1;
    }
  }
  if (!stack.length) return null;
  const top = stack[stack.length - 1];
  const lit = (a) => { const mm = String(a).match(/["']([^"']*)["']/); return mm ? mm[1] : String(a).trim(); };
  return { fn: top.name, argIndex: top.args.length, inString: s, prevArgs: top.args.map(lit) };
}

// ===== wrapper Obsidian =====
const { Plugin, PluginSettingTab, Setting, MarkdownView, EditorSuggest, debounce } = require('obsidian');

const DEFAULTS = {
  renderOnModify: true,   // recalcular al editar la nota
  enableJsFunctions: true, // permitir bloques ```calc-js (ejecuta JS de la nota)
  precision: 6,           // decimales máximos al formatear
  recalcDelay: 600,       // ms de espera tras dejar de teclear antes de recalcular
  preserveFocus: true,    // no reescribir la tabla donde está el cursor (no pierde el foco)
  autoParents: true,      // escribir `padres` (wikilinks) en el frontmatter + auto-recalc
  editorHelpers: true,    // autocompletado con ficha + hover dentro de los comentarios calc
  lang: 'auto',           // idioma de la UI: 'auto' (sigue a Obsidian) | 'es' | 'en'
  debug: false,
};

// Catálogo de funciones: ÚNICA fuente de verdad para el autocompletado, el hover
// y (referencia) la documentación. n=nombre, s=firma, g=grupo, d=descripción,
// e=ejemplo, ins=texto a insertar (por defecto "nombre(").
const CATALOG = [
  { n: 'sum', s: 'sum(...nums | col)', g: 'agg', d: 'Suma valores o una columna entera.', den: 'Sum values or a whole column.', e: 'sum(col("Total"))' },
  { n: 'mean', s: 'mean(...nums | col)', g: 'agg', d: 'Promedio (media).', den: 'Average (mean).', e: 'mean(col("Nota"))' },
  { n: 'avg', s: 'avg(...nums | col)', g: 'agg', d: 'Alias de mean.', den: 'Alias of mean.', e: 'avg(col("Nota"))' },
  { n: 'count', s: 'count(col)', g: 'agg', d: 'Número de elementos.', den: 'Number of items.', e: 'count(col("Item"))' },
  { n: 'product', s: 'product(...nums | col)', g: 'agg', d: 'Multiplica todos los valores.', den: 'Multiply all values.', e: 'product(col("Factor"))' },
  { n: 'min', s: 'min(...nums | col)', g: 'agg', d: 'Valor mínimo.', den: 'Minimum value.', e: 'min(col("Precio"))' },
  { n: 'max', s: 'max(...nums | col)', g: 'agg', d: 'Valor máximo.', den: 'Maximum value.', e: 'max(col("Precio"))' },
  { n: 'sumIf', s: 'sumIf(colCond, crit, colVal)', g: 'cond', d: 'Suma colVal donde colCond cumple el criterio ("activo", ">10").', den: 'Sum colVal where colCond meets the criteria ("active", ">10").', e: 'sumIf(col("Estado"),"activo",col("Total"))' },
  { n: 'countIf', s: 'countIf(colCond, crit)', g: 'cond', d: 'Cuenta filas que cumplen el criterio.', den: 'Count rows meeting the criteria.', e: 'countIf(col("Estado"),"activo")' },
  { n: 'avgIf', s: 'avgIf(colCond, crit, colVal)', g: 'cond', d: 'Promedio donde se cumple el criterio.', den: 'Average where the criteria is met.', e: 'avgIf(col("Estado"),"activo",col("Total"))' },
  { n: 'round', s: 'round(x, n)', g: 'math', d: 'Redondea x a n decimales.', den: 'Round x to n decimals.', e: 'round($Total, 2)' },
  { n: 'floor', s: 'floor(x)', g: 'math', d: 'Redondea hacia abajo.', den: 'Round down.', e: 'floor($X)' },
  { n: 'ceil', s: 'ceil(x)', g: 'math', d: 'Redondea hacia arriba.', den: 'Round up.', e: 'ceil($X)' },
  { n: 'abs', s: 'abs(x)', g: 'math', d: 'Valor absoluto.', den: 'Absolute value.', e: 'abs($Saldo)' },
  { n: 'sqrt', s: 'sqrt(x)', g: 'math', d: 'Raíz cuadrada.', den: 'Square root.', e: 'sqrt($Area)' },
  { n: 'pow', s: 'pow(x, y)', g: 'math', d: 'x elevado a y.', den: 'x to the power of y.', e: 'pow($Base, 2)' },
  { n: 'exp', s: 'exp(x)', g: 'math', d: 'e elevado a x.', den: 'e to the power of x.', e: 'exp($X)' },
  { n: 'log', s: 'log(x)', g: 'math', d: 'Logaritmo natural.', den: 'Natural logarithm.', e: 'log($X)' },
  { n: 'log10', s: 'log10(x)', g: 'math', d: 'Logaritmo base 10.', den: 'Base-10 logarithm.', e: 'log10($X)' },
  { n: 'IF', s: 'IF(cond, a, b)', g: 'logic', d: 'Devuelve a si cond es verdadero; si no, b.', den: 'Returns a if cond is true; otherwise b.', e: 'IF($Ventas > 100, 10, 0)' },
  { n: 'iif', s: 'iif(cond, a, b)', g: 'logic', d: 'Alias de IF.', den: 'Alias of IF.', e: 'iif($X > 0, "pos", "neg")' },
  { n: 'PI', s: 'PI', g: 'const', d: 'Número pi (3.14159…).', den: 'Pi (3.14159…).', e: '2 * PI * $Radio', ins: 'PI' },
  { n: 'E', s: 'E', g: 'const', d: 'Número e (2.71828…).', den: "Euler's number (2.71828…).", e: 'pow(E, $X)', ins: 'E' },
  { n: 'today', s: 'today()', g: 'date', d: 'Fecha de hoy (YYYY-MM-DD).', den: "Today's date (YYYY-MM-DD).", e: 'days(today(), $Vence)', ins: 'today()' },
  { n: 'days', s: 'days(a, b)', g: 'date', d: 'Días desde a hasta b.', den: 'Days from a to b.', e: 'days("2026-01-01", $Fecha)' },
  { n: 'dateAdd', s: 'dateAdd(a, n)', g: 'date', d: 'Suma n días a la fecha a.', den: 'Add n days to date a.', e: 'dateAdd($Fecha, 30)' },
  { n: 'year', s: 'year(a)', g: 'date', d: 'Año de la fecha.', den: 'Year of the date.', e: 'year($Fecha)' },
  { n: 'month', s: 'month(a)', g: 'date', d: 'Mes (1-12).', den: 'Month (1-12).', e: 'month($Fecha)' },
  { n: 'day', s: 'day(a)', g: 'date', d: 'Día del mes.', den: 'Day of the month.', e: 'day($Fecha)' },
  { n: 'weekday', s: 'weekday(a)', g: 'date', d: 'Día de la semana (0=domingo).', den: 'Day of week (0=Sunday).', e: 'weekday($Fecha)' },
  { n: 'money', s: 'money(x, sym?, dec?)', g: 'fmt', d: 'Formato moneda: money(1500) -> $1,500.00.', den: 'Currency format: money(1500) -> $1,500.00.', e: 'money($Total)' },
  { n: 'thousands', s: 'thousands(x, dec?)', g: 'fmt', d: 'Separador de miles: 1,500.', den: 'Thousands separator: 1,500.', e: 'thousands($Total)' },
  { n: 'percent', s: 'percent(x, dec?)', g: 'fmt', d: 'Añade % sin escalar: 28 -> "28%".', den: 'Adds % without scaling: 28 -> "28%".', e: 'percent($Pct)' },
  { n: 'format', s: 'format(x, pattern)', g: 'fmt', d: 'Patrón "$#,##0.00" / "0.0%" (% sí escala).', den: 'Pattern "$#,##0.00" / "0.0%" (% does scale).', e: 'format(0.28, "0.0%")' },
  { n: 'col', s: 'col("Col")', g: 'ref', d: 'Array con toda la columna (para agregados).', den: 'Array of the whole column (for aggregates).', e: 'sum(col("Total"))' },
  { n: 'cell', s: 'cell("Col", N)', g: 'ref', d: 'Celda concreta: columna, fila N (1-based).', den: 'Specific cell: column, row N (1-based).', e: 'cell("Total", 1)' },
  { n: 'row', s: 'row', g: 'ref', d: 'Índice de la fila actual (empieza en 1).', den: 'Current row index (starts at 1).', e: '$Idx = row', ins: 'row' },
  { n: 'up', s: 'up("Col", k=1)', g: 'rel', d: 'Valor k filas arriba (por defecto la anterior).', den: 'Value k rows above (previous by default).', e: '$Saldo = up("Saldo") + $Neto' },
  { n: 'down', s: 'down("Col", k=1)', g: 'rel', d: 'Valor k filas abajo.', den: 'Value k rows below.', e: 'down("Meta")' },
  { n: 'prev', s: 'prev("Col")', g: 'rel', d: 'Alias de up.', den: 'Alias of up.', e: 'prev("Saldo")' },
  { n: 'next', s: 'next("Col")', g: 'rel', d: 'Alias de down.', den: 'Alias of down.', e: 'next("Saldo")' },
  { n: 'runningSum', s: 'runningSum("Col")', g: 'rel', d: 'Suma acumulada hasta la fila actual.', den: 'Running total up to the current row.', e: '$Acum = runningSum("Neto")' },
  { n: 'lookup', s: 'lookup(keyCol, val, retCol)', g: 'lookup', d: 'Busca en ESTA tabla y devuelve otra columna.', den: 'Looks up in THIS table and returns another column.', e: 'lookup("Codigo", $Cod, "Precio")' },
  { n: 'tcol', s: 'tcol("table", "Col")', g: 'ttable', d: 'Columna de otra tabla @name de la misma nota.', den: 'Column of another @name table in the same note.', e: 'sum(tcol("lineas","Subtotal"))' },
  { n: 'tcell', s: 'tcell("table", "Col", N)', g: 'ttable', d: 'Celda de otra tabla @name de la misma nota.', den: 'Cell of another @name table in the same note.', e: 'tcell("precios","Precio",2)' },
  { n: 'tlookup', s: 'tlookup("table", keyCol, val, retCol)', g: 'ttable', d: 'Lookup en otra tabla @name de la misma nota.', den: 'Lookup in another @name table in the same note.', e: 'tlookup("precios","Prod",$P,"Precio")' },
  { n: 'xcell', s: 'xcell("Note", "table", "Col", N)', g: 'xnote', d: 'Celda de una tabla @name de OTRA nota.', den: 'Cell of an @name table in ANOTHER note.', e: 'xcell("Catalogo","precios","Precio",1)' },
  { n: 'xcol', s: 'xcol("Note", "table", "Col")', g: 'xnote', d: 'Columna de otra nota (para agregados).', den: 'Column of another note (for aggregates).', e: 'sumIf(xcol("Mayor","m","Cat"),"Activo",xcol("Mayor","m","Saldo"))' },
  { n: 'xlookup', s: 'xlookup("Note", "table", keyCol, val, retCol)', g: 'xnote', d: 'Lookup en una tabla @name de otra nota.', den: 'Lookup in an @name table of another note.', e: 'xlookup("Catalogo","precios","Prod","Monitor","Precio")' },
  { n: 'xfm', s: 'xfm("Note", "key")', g: 'xnote', d: 'Escalar del frontmatter de otra nota.', den: "Scalar from another note's frontmatter.", e: 'xfm("Config","tasa_iva")' },
  { n: 'fm', s: 'fm("key")', g: 'fm', d: 'Escalar del frontmatter de ESTA nota.', den: "Scalar from THIS note's frontmatter.", e: '$ConIVA = $Sub * (1 + fm("tasa_iva"))' },
  { n: '@name', s: '@name = name', g: 'directive', d: 'Nombra la tabla para consultarla con tcol/tcell/xcell…', den: 'Names the table so tcol/tcell/xcell… can query it.', e: '@name = ventas', ins: '@name = ' },
];
const CATALOG_BYNAME = (() => { const m = {}; for (const f of CATALOG) m[f.n] = f; return m; })();

const GRP = {
  agg: { es: 'agregado', en: 'aggregate' }, cond: { es: 'condicional', en: 'conditional' },
  math: { es: 'matemática', en: 'math' }, logic: { es: 'lógica', en: 'logic' },
  const: { es: 'constante', en: 'constant' }, date: { es: 'fecha', en: 'date' },
  fmt: { es: 'formato', en: 'format' }, ref: { es: 'referencia', en: 'reference' },
  rel: { es: 'relativa', en: 'relative' }, lookup: { es: 'búsqueda', en: 'lookup' },
  ttable: { es: 'otra tabla', en: 'other table' }, xnote: { es: 'otra nota', en: 'other note' },
  fm: { es: 'frontmatter', en: 'frontmatter' }, directive: { es: 'directiva', en: 'directive' },
  column: { es: 'columna', en: 'column' }, note: { es: 'nota', en: 'note' },
  noteP: { es: 'nota (ruta)', en: 'note (path)' },
  nameLocal: { es: '@name (esta nota)', en: '@name (this note)' },
  nameOther: { es: '@name (otra nota)', en: '@name (other note)' },
  fmOther: { es: 'frontmatter (otra nota)', en: 'frontmatter (other note)' },
  colOther: { es: 'columna (otra nota)', en: 'column (other note)' },
  colTable: { es: 'columna (otra tabla)', en: 'column (other table)' },
};

const I18N = {
  es: {
    cmdRecalc: 'Recalcular tablas (nota actual)',
    sRecalcN: 'Recalcular al editar', sRecalcD: 'Recalcula las tablas automáticamente cuando modificas la nota.',
    sJsN: 'Permitir funciones JavaScript (calc-js)', sJsD: 'Ejecuta el JavaScript de los bloques calc-js de la nota. Potente, pero actívalo solo en vaults de confianza: ejecuta código arbitrario.',
    sPrecN: 'Decimales máximos', sPrecD: 'Precisión al formatear resultados no enteros.',
    sDelayN: 'Tiempo de recálculo (ms)', sDelayD: 'Espera tras dejar de teclear antes de recalcular. Más alto = menos interrupciones.',
    sFocusN: 'Recuperar el foco al recalcular en vivo', sFocusD: 'Recalcula mientras editas y devuelve el cursor a la celda tras renderizar. Si lo apagas, el recálculo puede mover el foco.',
    sParentsN: 'Dependencias entre notas (padres)', sParentsD: 'Escribe la propiedad padres (wikilinks) en el frontmatter según las notas referenciadas con xcell/xcol/xlookup/xfm, y recalcula en cascada las notas hijas. Apágalo para no tocar el frontmatter.',
    sHelpersN: 'Ayudas del editor (autocompletado + fichas)', sHelpersD: 'Dentro de los comentarios calc sugiere funciones (firma, descripción, ejemplo), columnas, tablas @name y notas. Muestra una ficha al pasar el ratón.',
    sLangN: 'Idioma', sLangD: 'Idioma de la interfaz y de las ayudas del editor.',
    sDebugN: 'Logs de depuración', sDebugD: 'Avisa en consola cuando una fórmula o función falla.',
    langAuto: 'Automático (Obsidian)',
  },
  en: {
    cmdRecalc: 'Recalculate tables (current note)',
    sRecalcN: 'Recalculate while editing', sRecalcD: 'Automatically recalculates tables when you edit the note.',
    sJsN: 'Allow JavaScript functions (calc-js)', sJsD: "Runs the JavaScript in the note's calc-js blocks. Powerful, but enable it only in trusted vaults: it executes arbitrary code.",
    sPrecN: 'Max decimals', sPrecD: 'Precision when formatting non-integer results.',
    sDelayN: 'Recalculation delay (ms)', sDelayD: 'Wait after you stop typing before recalculating. Higher = fewer interruptions.',
    sFocusN: 'Keep focus on live recalculation', sFocusD: 'Recalculates while you edit and returns the cursor to the cell after rendering. If off, recalculation may move your focus.',
    sParentsN: 'Cross-note dependencies (parents)', sParentsD: 'Writes the padres property (wikilinks) in the frontmatter based on notes referenced with xcell/xcol/xlookup/xfm, and cascades recalculation to child notes. Turn off to leave the frontmatter untouched.',
    sHelpersN: 'Editor helpers (autocomplete + cards)', sHelpersD: 'Inside calc comments, suggests functions (signature, description, example), columns, @name tables and note names. Shows a card on hover.',
    sLangN: 'Language', sLangD: 'Language of the interface and editor helpers.',
    sDebugN: 'Debug logs', sDebugD: 'Warns in the console when a formula or function fails.',
    langAuto: 'Automatic (Obsidian)',
  },
};

class MarkCalcPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.isUpdating = false;
    this._suggestOpen = false;                                      // popup de autocompletado abierto
    this.selfWrites = new Set();                                    // rutas que escribimos nosotros
    this.refIndex = { bySource: new Map(), byConsumer: new Map() }; // grafo de dependencias
    this.rebuildScheduler();

    // Indexa qué nota referencia a cuál (para auto-recalc por dependencias).
    this.app.workspace.onLayoutReady(() => this.buildRefIndex());

    this.addCommand({
      id: 'markcalc-recalc-current',
      name: this.t('cmdRecalc'),
      callback: () => this.recalcActiveFile(),
    });

    // Recalcular al teclear en el editor (vista activa).
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor, info) => {
        if (!this.settings.renderOnModify || this.isUpdating) return;
        const file = info && info.file;
        if (file && file.extension === 'md') this.scheduleRecalc(file);
      })
    );

    // Cambio en disco (sync, otra nota): recalcula esa nota y sus dependientes.
    // Ignora nuestras propias escrituras y la nota activa (la lleva editor-change).
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!this.settings.renderOnModify || this.isUpdating) return;
        if (!file || file.extension !== 'md') return;
        if (this.selfWrites.has(file.path)) return;
        const active = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (active && active.file && active.file.path === file.path) return;
        this.recalcChain(file, new Set());
      })
    );

    // Recalcular al abrir una nota.
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (file && file.extension === 'md') this.scheduleRecalc(file);
      })
    );

    // Mantén el índice inverso (padre -> hijas) desde el frontmatter en caché,
    // sin leer cuerpos: al cambiar los metadatos de una nota, reindexa sus padres.
    this.registerEvent(
      this.app.metadataCache.on('changed', (file, data, cache) => {
        this.indexFromFrontmatter(file.path, cache && cache.frontmatter);
      })
    );

    this.addSettingTab(new MarkCalcSettingTab(this.app, this));

    // Ayudas del editor: autocompletado contextual con ficha + hover.
    try { this.registerEditorSuggest(new MarkCalcSuggest(this)); }
    catch (e) { if (this.settings.debug) console.warn('MarkCalc suggest:', e.message); }
    try { const hx = this.buildHoverExtension(); if (hx) this.registerEditorExtension([hx]); }
    catch (e) { if (this.settings.debug) console.warn('MarkCalc hover:', e.message); }

    if (this.settings.debug) console.log('MarkCalc cargado');
  }

  onunload() {}

  // (Re)crea el debounce con el retardo actual. Se llama al cargar y al
  // cambiar el ajuste "Tiempo de recálculo".
  rebuildScheduler() {
    const delay = Math.max(0, parseInt(this.settings.recalcDelay, 10) || 0);
    this.scheduleRecalc = debounce((file) => this.recalcChain(file, new Set()), delay, true);
  }

  async recalcActiveFile() {
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === 'md') await this.recalcChain(file, new Set());
  }

  // Recalcula UNA nota. Devuelve true si su contenido cambió. (Anti-reentrada
  // por isUpdating; no reescribe si nada cambió.)
  async recalcFile(file) {
    if (this.isUpdating) return false;
    // No reescribir el documento mientras el autocompletado está abierto: el
    // setValue movería el cursor y el contexto del popup. Reintenta al cerrarse.
    if (this._suggestOpen) { this.scheduleRecalc(file); return false; }
    let changed = false;
    try {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const isActive = view && view.file && file && view.file.path === file.path;

      // Si estoy ESCRIBIENDO la fórmula (cursor dentro del comentario calc, con el
      // editor enfocado), no recalcular todavía: esperar a salir del comentario.
      // Evita renderizar/auto-expandir con la fórmula a medio escribir o sin cerrar.
      if (isActive && view.editor) {
        const focused = view.editor.hasFocus ? view.editor.hasFocus() : true;
        if (focused && mcInCalc(view.editor.getRange({ line: 0, ch: 0 }, view.editor.getCursor()))) {
          this.scheduleRecalc(file);
          return false;
        }
      }

      const content = isActive ? view.editor.getValue() : await this.app.vault.read(file);
      const externals = await this.resolveExternals(content, file);
      let out = processContent(content, this.settings, externals);

      // Escribe/actualiza `padres` (wikilinks) en el frontmatter según las notas
      // que esta referencia. El índice inverso (hijas) se mantiene aparte desde
      // metadataCache. Solo cambia el contenido si el conjunto de padres cambió.
      if (this.settings.autoParents) out = upsertParents(out, Array.from(scanExternalRefs(content)));

      if (out == null || out === content) return false;
      changed = true;

      this.isUpdating = true;
      if (isActive) {
        // Recalcula EN VIVO (sin salir de la celda): re-renderiza y devuelve el
        // cursor a su sitio dentro de la celda, recuperando el foco.
        const ed = view.editor;
        const cur = ed.getCursor();
        const hadFocus = ed.hasFocus ? ed.hasFocus() : true;
        const scroll = ed.getScrollInfo ? ed.getScrollInfo() : null;

        // Remapea el cursor solo si el nº de líneas no cambió. Si se insertó o
        // quitó frontmatter (padres), las líneas se desplazan: no remapear.
        let target = cur;
        const sameLineCount = content.split('\n').length === out.split('\n').length;
        if (this.settings.preserveFocus && sameLineCount) {
          const oldLine = content.split('\n')[cur.line] || '';
          const newLine = out.split('\n')[cur.line] || '';
          target = { line: cur.line, ch: remapCursorCh(oldLine, newLine, cur.ch) };
        }

        ed.setValue(out); // re-render: aquí ves el resultado actualizado
        if (this.settings.preserveFocus && hadFocus && ed.focus) ed.focus();
        try { ed.setCursor(target); } catch (e) { try { ed.setCursor(cur); } catch (_) {} }
        if (scroll && ed.scrollTo) ed.scrollTo(scroll.left, scroll.top);
      } else {
        // Nota no activa: escritura directa. Marca selfWrites para no recursar
        // sobre nuestro propio evento 'modify'.
        this.selfWrites.add(file.path);
        await this.app.vault.modify(file, out);
        setTimeout(() => this.selfWrites.delete(file.path), 0);
      }
    } catch (e) {
      console.error('MarkCalc error:', e);
    } finally {
      this.isUpdating = false;
    }
    return changed;
  }

  // Recalcula una nota y, en cascada, las que dependen de ella. `visited` evita
  // ciclos (A->B->A). La raíz siempre propaga; los niveles profundos solo si
  // cambiaron, así la cascada termina en un punto fijo.
  async recalcChain(file, visited) {
    visited = visited || new Set();
    if (!file || visited.has(file.path)) return;
    const isRoot = visited.size === 0;
    visited.add(file.path);
    const changed = await this.recalcFile(file);
    if (!changed && !isRoot) return;
    const consumers = this.refIndex.bySource.get(file.path);
    if (!consumers) return;
    for (const path of Array.from(consumers)) {
      if (visited.has(path)) continue;
      const cf = this.app.vault.getAbstractFileByPath(path);
      if (cf) await this.recalcChain(cf, visited);
    }
  }

  // Lee las notas externas referenciadas -> { claveNota: {tables, fm} }.
  // Usa el editor activo si la fuente está abierta (valores en vivo); si no, cachedRead.
  async resolveExternals(content, sourceFile) {
    const ext = {};
    const refs = scanExternalRefs(content);
    if (!refs.size) return ext;
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    const srcPath = sourceFile ? sourceFile.path : '';
    for (const raw of refs) {
      const dest = this.app.metadataCache.getFirstLinkpathDest(String(raw).trim(), srcPath);
      if (!dest) continue;
      let c;
      if (active && active.file && active.file.path === dest.path) c = active.editor.getValue();
      else c = await this.app.vault.cachedRead(dest);
      ext[normNote(raw)] = extractNoteData(c);
    }
    return ext;
  }

  // Actualiza el índice inverso (padre -> hijas) para `path` leyendo su propiedad
  // `padres` del frontmatter en caché. NO lee el cuerpo de la nota.
  indexFromFrontmatter(path, frontmatter) {
    const newKeys = new Set();
    const padres = frontmatter && frontmatter.padres;
    if (padres != null) {
      const arr = Array.isArray(padres) ? padres : [padres];
      const names = [];
      for (const p of arr) {
        const wl = parseWikilinks(String(p));
        if (wl.length) wl.forEach((t) => names.push(t));
        else { const t = String(p).trim().replace(/^["']|["']$/g, ''); if (t) names.push(t); }
      }
      for (const name of names) {
        // Resuelve el nombre/ruta a un archivo REAL (como wikilink, relativo a la
        // nota) y usa su RUTA como clave: única aunque existan homónimos en otras
        // carpetas. Si no resuelve (la fuente aún no existe), se omite.
        const dest = this.app.metadataCache.getFirstLinkpathDest(name, path);
        if (dest) newKeys.add(dest.path);
      }
    }
    const oldKeys = this.refIndex.byConsumer.get(path) || new Set();
    for (const k of oldKeys) {
      if (newKeys.has(k)) continue;
      const s = this.refIndex.bySource.get(k);
      if (s) { s.delete(path); if (!s.size) this.refIndex.bySource.delete(k); }
    }
    for (const k of newKeys) {
      let s = this.refIndex.bySource.get(k);
      if (!s) { s = new Set(); this.refIndex.bySource.set(k, s); }
      s.add(path);
    }
    if (newKeys.size) this.refIndex.byConsumer.set(path, newKeys);
    else this.refIndex.byConsumer.delete(path);
  }

  // Índice inicial desde el frontmatter ya cacheado por Obsidian (en memoria,
  // sin leer cuerpos ni recorrer disco).
  buildRefIndex() {
    try {
      for (const f of this.app.vault.getMarkdownFiles()) {
        const cache = this.app.metadataCache.getFileCache(f);
        this.indexFromFrontmatter(f.path, cache && cache.frontmatter);
      }
    } catch (e) {
      if (this.settings.debug) console.warn('MarkCalc index:', e.message);
    }
  }

  // Ficha flotante (hover) para una función conocida del catálogo.
  mcInfoCard(fn) {
    const el = document.createElement('div');
    el.className = 'markcalc-info';
    const add = (cls, txt) => { if (!txt) return; const d = document.createElement('div'); d.className = cls; d.textContent = txt; el.appendChild(d); };
    add('mc-sig', fn.s || fn.n);
    add('mc-grp', fn.g);
    add('mc-desc', fn.d);
    add('mc-ex', fn.e);
    return el;
  }

  // Extensión CM6: ficha al pasar el ratón sobre una función dentro de un calc.
  buildHoverExtension() {
    let hoverTooltip;
    try { hoverTooltip = require('@codemirror/view').hoverTooltip; } catch (e) { return null; }
    if (!hoverTooltip) return null;
    const self = this;
    return hoverTooltip((view, pos) => {
      if (!self.settings.editorHelpers) return null;
      if (!mcInCalc(view.state.sliceDoc(0, pos))) return null;
      const line = view.state.doc.lineAt(pos);
      const t = line.text;
      let a = pos - line.from, b = pos - line.from;
      while (a > 0 && /\w/.test(t[a - 1])) a--;
      while (b < t.length && /\w/.test(t[b])) b++;
      const fn = CATALOG_BYNAME[t.slice(a, b)];
      if (!fn) return null;
      return { pos: line.from + a, end: line.from + b, above: true, create: () => ({ dom: self.mcInfoCard(self.locFn(fn)) }) };
    });
  }

  // --- i18n ---------------------------------------------------------------
  lang() {
    const l = this.settings.lang;
    if (l === 'es' || l === 'en') return l;
    let ob = '';
    try { ob = window.localStorage.getItem('language') || ''; } catch (e) {}
    return ob === 'es' ? 'es' : 'en';
  }
  t(key) {
    const d = I18N[this.lang()] || I18N.en;
    return d[key] != null ? d[key] : (I18N.en[key] != null ? I18N.en[key] : key);
  }
  locFn(fn) {
    if (!fn) return fn;
    const lang = this.lang();
    const g = fn.g && GRP[fn.g] ? (GRP[fn.g][lang] || GRP[fn.g].en) : fn.g;
    const d = lang === 'en' ? (fn.den || fn.d) : (fn.d || fn.den);
    return { s: fn.s, e: fn.e, g, d };
  }

  async saveSettings() { await this.saveData(this.settings); }
}

// Autocompletado contextual: solo dentro de los comentarios <!-- calc: -->.
// Ofrece funciones (con firma/descripción/ejemplo), columnas de la tabla, @names
// locales y, dentro del primer argumento de x..., nombres de nota del vault.
class MarkCalcSuggest extends EditorSuggest {
  constructor(plugin) { super(plugin.app); this.plugin = plugin; }

  // Marca el popup como abierto/cerrado. Mientras está abierto, el recálculo
  // (setValue) NO se dispara (era lo que saltaba el cursor fuera del bloque calc).
  open() { super.open(); this.plugin._suggestOpen = true; }
  close() { super.close(); this.plugin._suggestOpen = false; }

  onTrigger(cursor, editor) {
    if (!this.plugin.settings.editorHelpers) return null;
    if (!mcInCalc(editor.getRange({ line: 0, ch: 0 }, cursor))) return null;
    const lineText = editor.getLine(cursor.line).slice(0, cursor.ch);
    const call = mcEnclosingCall(lineText);
    if (call && call.inString) {
      const m = lineText.match(/["']([^"']*)$/);
      return this.trig(cursor, m ? m[1] : '');
    }
    const m = lineText.match(/[@$]?[A-Za-z_][\w]*$|[@$]$/);
    if (!m) return null;
    return this.trig(cursor, m[0]);
  }

  trig(cursor, query) {
    return {
      start: { line: cursor.line, ch: cursor.ch - query.length },
      end: { line: cursor.line, ch: cursor.ch },
      query,
    };
  }

  async getSuggestions(context) {
    const q = (context.query || '').toLowerCase();
    const lineText = context.editor.getLine(context.start.line).slice(0, context.end.ch);
    const call = mcEnclosingCall(lineText);
    let items = await this.contextItems(call, context, q);
    if (items == null) items = this.genericItems(context, q);
    return items;
  }

  // Sugerencias según el ARGUMENTO de la función en curso (contexto sacado de la
  // propia fórmula): notas, tablas @name (misma u otra nota), o columnas correctas.
  async contextItems(call, context, q) {
    if (!call || !call.inString) return null;
    const fn = call.fn, ai = call.argIndex, prev = call.prevArgs;
    const isX = (fn === 'xcell' || fn === 'xcol' || fn === 'xlookup');
    const anyX = isX || fn === 'xfm';
    // arg 0 de x-funciones -> NOMBRE DE NOTA
    if (anyX && ai === 0) return this.noteItems(q);
    // arg 1 de xcell/xcol/xlookup -> TABLA @name de la OTRA nota
    if (isX && ai === 1) {
      const data = await this.otherNoteData(prev[0], context);
      return this.nameItems(data ? Object.keys(data.tables) : [], q, 'nameOther');
    }
    // arg 1 de xfm -> CLAVE de frontmatter de la otra nota
    if (fn === 'xfm' && ai === 1) {
      const data = await this.otherNoteData(prev[0], context);
      return this.nameItems(data ? Object.keys(data.fm) : [], q, 'fmOther');
    }
    // COLUMNA de tabla de OTRA nota
    if ((fn === 'xcell' || fn === 'xcol') && ai === 2) return this.colItems(await this.otherTableCols(prev[0], prev[1], context), q, 'colOther');
    if (fn === 'xlookup' && (ai === 2 || ai === 4)) return this.colItems(await this.otherTableCols(prev[0], prev[1], context), q, 'colOther');
    // arg 0 de t-funciones -> TABLA @name de ESTA nota
    if ((fn === 'tcol' || fn === 'tcell' || fn === 'tlookup') && ai === 0) {
      return this.nameItems(mcLocalNames(context.editor.getValue()), q, 'nameLocal');
    }
    // COLUMNA de otra tabla de ESTA nota
    if ((fn === 'tcol' || fn === 'tcell') && ai === 1) return this.colItems(this.localTableCols(prev[0], context), q, 'colTable');
    if (fn === 'tlookup' && (ai === 1 || ai === 3)) return this.colItems(this.localTableCols(prev[0], context), q, 'colTable');
    // COLUMNA de la tabla ACTUAL (lookup / col / cell)
    if ((fn === 'lookup' && (ai === 0 || ai === 2)) || (fn === 'col' && ai === 0) || (fn === 'cell' && ai === 0)) {
      return this.colItems(mcColumnsAbove((i) => context.editor.getLine(i), context.start.line), q, 'column');
    }
    return null;
  }

  genericItems(context, q) {
    const out = [];
    const cols = mcColumnsAbove((i) => context.editor.getLine(i), context.start.line);
    for (const c of cols) {
      const ins = /[^A-Za-z0-9_]/.test(c) ? '${' + c + '}' : '$' + c;
      out.push({ kind: 'col', label: c, insert: ins, fn: { s: ins, g: 'column', d: 'Valor de “' + c + '” en la fila actual.', den: 'Value of “' + c + '” in the current row.', e: '$X = ' + ins + ' * 2' } });
    }
    for (const f of CATALOG) out.push({ kind: 'fn', label: f.n, insert: f.ins || (f.n + '('), fn: f });
    const qq = q.replace(/^[$@]/, '');
    return out.filter((o) => o.label.toLowerCase().includes(qq)).slice(0, 60);
  }

  noteItems(q) {
    const files = this.plugin.app.vault.getMarkdownFiles();
    const counts = {};
    for (const f of files) counts[f.basename] = (counts[f.basename] || 0) + 1;
    return files
      .map((f) => {
        const dup = counts[f.basename] > 1;
        const insert = dup ? f.path.replace(/\.md$/i, '') : f.basename;
        return { kind: 'note', label: f.basename, insert, fn: { s: insert, g: dup ? 'noteP' : 'note', d: f.path } };
      })
      .filter((o) => o.label.toLowerCase().includes(q) || o.insert.toLowerCase().includes(q))
      .slice(0, 50);
  }

  nameItems(names, q, grp) {
    return (names || []).filter((n) => n.toLowerCase().includes(q))
      .map((n) => ({ kind: 'name', label: n, insert: n, fn: { s: n, g: grp } }))
      .slice(0, 50);
  }

  // Columnas dentro de un argumento string -> se insertan SIN $ (van entre comillas).
  colItems(cols, q, grp) {
    return (cols || []).filter((c) => c.toLowerCase().includes(q))
      .map((c) => ({ kind: 'col', label: c, insert: c, fn: { s: c, g: grp || 'column' } }))
      .slice(0, 50);
  }

  async otherNoteData(noteName, context) {
    if (!noteName) return null;
    const app = this.plugin.app;
    const dest = app.metadataCache.getFirstLinkpathDest(String(noteName).trim(), context.file ? context.file.path : '');
    if (!dest) return null;
    let content;
    const active = app.workspace.getActiveViewOfType(MarkdownView);
    if (active && active.file && active.file.path === dest.path) content = active.editor.getValue();
    else content = await app.vault.cachedRead(dest);
    return extractNoteData(content);
  }

  async otherTableCols(noteName, tableName, context) {
    const data = await this.otherNoteData(noteName, context);
    if (!data || !tableName) return [];
    const t = data.tables[String(tableName).trim().toLowerCase()];
    return t ? t.header.filter(Boolean) : [];
  }

  localTableCols(name, context) {
    if (!name) return [];
    const t = extractNoteData(context.editor.getValue()).tables[String(name).trim().toLowerCase()];
    return t ? t.header.filter(Boolean) : [];
  }

  renderSuggestion(item, el) {
    el.addClass('markcalc-sugg');
    const f = this.plugin.locFn(item.fn) || {};
    const head = el.createDiv({ cls: 'mc-sg-head' });
    head.createSpan({ cls: 'mc-sg-name', text: f.s || item.label });
    if (f.g) head.createSpan({ cls: 'mc-sg-grp', text: f.g });
    if (f.d) el.createDiv({ cls: 'mc-sg-desc', text: f.d });
    if (f.e) el.createDiv({ cls: 'mc-sg-ex', text: f.e });
  }

  selectSuggestion(item) {
    const ctx = this.context;
    if (!ctx || !item) return;
    const editor = ctx.editor;
    // Re-deriva el rango desde el CURSOR REAL al elegir (no de un contexto viejo).
    const cursor = editor.getCursor();
    const lineText = editor.getLine(cursor.line).slice(0, cursor.ch);
    const call = mcEnclosingCall(lineText);
    let startCh;
    if (call && call.inString) {
      const m = lineText.match(/["']([^"']*)$/);
      startCh = m ? cursor.ch - m[1].length : cursor.ch;
    } else {
      const m = lineText.match(/[@$]?[A-Za-z_][\w]*$|[@$]$/);
      startCh = m ? cursor.ch - m[0].length : cursor.ch;
    }
    if (startCh < 0 || startCh > cursor.ch) startCh = cursor.ch;
    editor.replaceRange(item.insert, { line: cursor.line, ch: startCh }, cursor);
    editor.setCursor({ line: cursor.line, ch: startCh + item.insert.length });
    editor.focus();
  }
}

class MarkCalcSettingTab extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

  display() {
    const { containerEl } = this;
    const p = this.plugin;
    const t = (k) => p.t(k);
    const save = async () => { await p.saveSettings(); };
    containerEl.empty();
    containerEl.createEl('h2', { text: 'MarkCalc' });

    new Setting(containerEl)
      .setName(t('sLangN')).setDesc(t('sLangD'))
      .addDropdown((d) => d
        .addOption('auto', t('langAuto'))
        .addOption('es', 'Español')
        .addOption('en', 'English')
        .setValue(p.settings.lang)
        .onChange(async (v) => { p.settings.lang = v; await save(); this.display(); }));

    new Setting(containerEl)
      .setName(t('sRecalcN')).setDesc(t('sRecalcD'))
      .addToggle((x) => x.setValue(p.settings.renderOnModify).onChange(async (v) => { p.settings.renderOnModify = v; await save(); }));

    new Setting(containerEl)
      .setName(t('sJsN')).setDesc(t('sJsD'))
      .addToggle((x) => x.setValue(p.settings.enableJsFunctions).onChange(async (v) => { p.settings.enableJsFunctions = v; await save(); }));

    new Setting(containerEl)
      .setName(t('sPrecN')).setDesc(t('sPrecD'))
      .addText((x) => x.setValue(String(p.settings.precision)).onChange(async (v) => { const n = parseInt(v, 10); if (!isNaN(n)) { p.settings.precision = n; await save(); } }));

    new Setting(containerEl)
      .setName(t('sDelayN')).setDesc(t('sDelayD'))
      .addText((x) => x.setValue(String(p.settings.recalcDelay)).onChange(async (v) => { const n = parseInt(v, 10); if (!isNaN(n) && n >= 0) { p.settings.recalcDelay = n; await save(); p.rebuildScheduler(); } }));

    new Setting(containerEl)
      .setName(t('sFocusN')).setDesc(t('sFocusD'))
      .addToggle((x) => x.setValue(p.settings.preserveFocus).onChange(async (v) => { p.settings.preserveFocus = v; await save(); }));

    new Setting(containerEl)
      .setName(t('sParentsN')).setDesc(t('sParentsD'))
      .addToggle((x) => x.setValue(p.settings.autoParents).onChange(async (v) => { p.settings.autoParents = v; await save(); }));

    new Setting(containerEl)
      .setName(t('sHelpersN')).setDesc(t('sHelpersD'))
      .addToggle((x) => x.setValue(p.settings.editorHelpers).onChange(async (v) => { p.settings.editorHelpers = v; await save(); }));

    new Setting(containerEl)
      .setName(t('sDebugN')).setDesc(t('sDebugD'))
      .addToggle((x) => x.setValue(p.settings.debug).onChange(async (v) => { p.settings.debug = v; await save(); }));
  }
}

module.exports = MarkCalcPlugin;

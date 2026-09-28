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

// ===== exports (solo para tests; build.js los elimina) =====
if (typeof module !== "undefined" && module.exports) {
  module.exports = { num, asArray, matchCriteria, parseDate, isoDate, formatNumber, HELPERS, RESERVED, validIdent, evalExpr, splitRow, isSeparator, isTableStart, sanitize, coerce, formatValue, extractFenced, makeExprFn, buildUserScope, parseTable, renderTable, parseFormula, applyFormulas, parseFrontmatter, normNote, scanExternalRefs, extractNoteData, parseWikilinks, readParents, upsertParents, processContent, remapCursorCh, mcInCalc, mcColumnsAbove, mcLocalNames, mcEnclosingCall };
}

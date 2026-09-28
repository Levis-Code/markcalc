#!/usr/bin/env node
/* MarkCalc — suite de tests del motor (sin dependencias).
 * Uso:  node src/test/run.js
 * Prueba el MOTOR y la LÓGICA pura. NO cubre el editor vivo de Obsidian
 * (EditorSuggest, hover, foco): eso es prueba manual.
 */
'use strict';
const E = require('../engine.js');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const L = (...lines) => lines.join('\n');
const has = (out, re) => re.test(out);

// ===================== MOTOR (misma tabla) =====================
let out = E.processContent(L(
  '| Item | Qty | Price | Total |', '| - | -: | -: | -: |',
  '| A | 2 | 10 |  |', '| B | 3 | 5 |  |',
  '<!-- calc: $Total = $Qty * $Price -->'), { precision: 6 }, {});
ok('columna $Total = $Qty*$Price', has(out, /\|\s*A\s*\|\s*2\s*\|\s*10\s*\|\s*20\s*\|/) && has(out, /\|\s*B\s*\|.*\|\s*15\s*\|/));

out = E.processContent(L(
  '| Q | T |', '| -: | -: |', '| 2 |  |', '| 3 |  |',
  '<!-- calc: T(1) = Q(1) + Q(2) -->'), { precision: 6 }, {});
ok('fórmula de celda T(1)=Q(1)+Q(2)=5', has(out, /\|\s*2\s*\|\s*5\s*\|/));

out = E.processContent(L(
  '| Item | Qty |', '| - | -: |', '| A | 2 |', '| B | 3 |',
  '<!-- calc: Qty(4) = 99 -->'), { precision: 6 }, {});
ok('auto-expansión a fila 4', (out.match(/\|/g) || []).length > 12 && has(out, /99/));

out = E.processContent(L(
  '| Mes | Neto | Saldo |', '| - | -: | -: |',
  '| Ene | 100 |  |', '| Feb | 50 |  |', '| Mar | -30 |  |',
  '<!-- calc: $Saldo = up("Saldo") + $Neto -->'), { precision: 6 }, {});
ok('saldo acumulado up() = 100,150,120', has(out, /Ene.*100/) && has(out, /Feb.*150/) && has(out, /Mar.*120/));

out = E.processContent(L(
  '| Est | Tot |', '| - | -: |', '| activo | 10 |', '| baja | 5 |', '| activo | 20 |',
  '| TOTAL | 0 |',
  '<!-- calc: Tot(4) = sumIf(col("Est"),"activo",col("Tot")) -->'), { precision: 6 }, {});
ok('sumIf criterio "activo" = 30', has(out, /TOTAL\s*\|\s*30/));

out = E.processContent(L(
  '```calc-functions', 'iva(x) = x * 0.21', '```', '',
  '| Base | ConIva |', '| -: | -: |', '| 100 |  |',
  '<!-- calc: $ConIva = round($Base + iva($Base), 2) -->'), { precision: 6 }, {});
ok('calc-functions iva(100) -> 121', has(out, /100\s*\|\s*121/));

out = E.processContent(L(
  '```calc-js', 'exports.desc = (p, q) => p * (q >= 3 ? 0.9 : 1);', '```', '',
  '| P | Q | Neto |', '| -: | -: | -: |', '| 100 | 5 |  |',
  '<!-- calc: $Neto = desc($P, $Q) -->'), { precision: 6, enableJsFunctions: true }, {});
ok('calc-js descuento(100,5) -> 90', has(out, /100\s*\|\s*5\s*\|\s*90/));

out = E.processContent(L(
  '---', 'tasa: 0.21', '---', '',
  '| Sub | Con |', '| -: | -: |', '| 100 |  |',
  '<!-- calc: $Con = round($Sub * (1 + fm("tasa")), 2) -->'), { precision: 6 }, {});
ok('fm("tasa") del frontmatter propio -> 121', has(out, /100\s*\|\s*121/));

out = E.processContent(L(
  '| X | M |', '| -: | - |', '| 1500 |  |',
  '<!-- calc: $M = money($X) -->'), { precision: 6 }, {});
ok('formato money(1500) -> $1,500.00', has(out, /\$1,500\.00/));

ok('displayWidth: Han Ext, emoji ZWJ, ancho completo y acentos',
  eq(E.renderTable({
    header: ['𪚥', '👨‍👩‍👧‍👦', 'Ａ', 'e\u0301'],
    align: ['-', '-', '-', '-'],
    rows: [['1', '2', '3', '4']],
  }), [
    '| 𪚥  | 👨‍👩‍👧‍👦  | Ａ  | é   |',
    '| --- | --- | --- | --- |',
    '| 1   | 2   | 3   | 4   |',
  ]));

out = E.processContent(L(
  '| 品(甲) | 😀 | 😁 | 总 计 |', '| - | - | - | - |', '| 苹果 | 2 | 3 |  |',
  '<!-- calc: ${总 计} = ${😀} + ${😁} -->'
), { precision: 6 }, {});
ok('unicode: cálculo con emojis (no colisionan) y nombres complejos',
  has(out, /\| 苹果\s*\|\s*2\s*\|\s*3\s*\|\s*5\s*\|/));

out = E.processContent(L(
  '| 汉 | 数量 | 结果 |', '| - | - | - |', '| 0 | 2 |  |',
  '<!-- calc: $汉 = 1 ; ${结果} = "$数量" -->'
), { precision: 6 }, {});
ok('unicode: variable no-ASCII exige ${...} y respeta strings literal',
  eq(E.parseTable(out.split('\n'), 0).rows[0], ['0', '2', '$数量']));


// ===================== MISMA NOTA (entre tablas) =====================
out = E.processContent(L(
  '| Prod | Precio |', '| - | -: |', '| Cafe | 3 |', '| Te | 2 |',
  '<!-- calc: @name = precios -->', '',
  '| Art | PU | Sub |', '| - | -: | -: |', '| Cafe | 0 | 0 |',
  '<!-- calc: $PU = tlookup("precios","Prod",$Art,"Precio") ; $Sub = $PU * 4 -->'), { precision: 6 }, {});
ok('tlookup entre tablas de la nota (Cafe -> 3, Sub 12)', has(out, /Cafe\s*\|\s*3\s*\|\s*12/));

// ===================== CROSS-NOTE + CONTABLE =====================
const submayor = L(
  '| Cuenta | Categoria | Nat | Debe | Haber | Saldo |',
  '| - | - | - | -: | -: | -: |',
  '| Caja | Activo | D | 5000 | 1000 | 4000 |',
  '| Bancos | Activo | D | 30000 | 12000 | 18000 |',
  '| CxC | Activo | D | 15000 | 7000 | 8000 |',
  '| Inv | Activo | D | 25000 | 5000 | 20000 |',
  '| CxP | Pasivo | A | 4000 | 14000 | 10000 |',
  '| Prest | Pasivo | A | 0 | 20000 | 20000 |',
  '| Cap | Patrimonio | A | 0 | 15000 | 15000 |',
  '| Util | Patrimonio | A | 0 | 5000 | 5000 |',
  '<!-- calc: @name = mayor ; $Saldo = $Nat == "D" ? $Debe - $Haber : $Haber - $Debe -->');
const cat = L('---', 'tasa_iva: 0.21', '---', '',
  '| Producto | PrecioBase |', '| - | -: |', '| Teclado | 100 |', '| Monitor | 200 |',
  '<!-- calc: @name = precios -->');
const ext = {};
ext[E.normNote('Submayor')] = E.extractNoteData(submayor);
ext[E.normNote('Catalogo')] = E.extractNoteData(cat);

ok('extractNoteData: tabla @name + filas', eq(ext[E.normNote('Submayor')].tables.mayor.header, ['Cuenta','Categoria','Nat','Debe','Haber','Saldo']));
ok('extractNoteData: frontmatter', ext[E.normNote('Catalogo')].fm.tasa_iva === '0.21');

out = E.processContent(L(
  '| S | M |', '| - | -: |', '| Activo | 0 |', '| Pasivo | 0 |', '| Patrim | 0 |', '| Descuadre | 0 |',
  '<!-- calc:',
  '  Monto = 0 ;',
  '  M(1) = sumIf(xcol("Submayor","mayor","Categoria"),"Activo",xcol("Submayor","mayor","Saldo")) ;',
  '  M(2) = sumIf(xcol("Submayor","mayor","Categoria"),"Pasivo",xcol("Submayor","mayor","Saldo")) ;',
  '  M(3) = sumIf(xcol("Submayor","mayor","Categoria"),"Patrimonio",xcol("Submayor","mayor","Saldo")) ;',
  '  M(4) = M(1) - (M(2) + M(3))',
  '-->'), { precision: 6 }, ext);
ok('cross-note balance: Activo=50000', has(out, /Activo\s*\|\s*50000/));
ok('cross-note balance: Pasivo=30000', has(out, /Pasivo\s*\|\s*30000/));
ok('cross-note balance: Patrimonio=20000', has(out, /Patrim\s*\|\s*20000/));
ok('cross-note balance: Descuadre=0 (cuadra)', has(out, /Descuadre\s*\|\s*0/));

out = E.processContent(L(
  '| K | V |', '| - | -: |', '| a | 0 |',
  '<!-- calc: V(1) = xcell("Catalogo","precios","PrecioBase",2) -->'), { precision: 6 }, ext);
ok('xcell otra nota (PrecioBase fila2 = 200)', has(out, /a\s*\|\s*200/));

out = E.processContent(L(
  '| K | V |', '| - | -: |', '| a | 0 |',
  '<!-- calc: V(1) = xlookup("Catalogo","precios","Producto","Teclado","PrecioBase") -->'), { precision: 6 }, ext);
ok('xlookup otra nota (Teclado -> 100)', has(out, /a\s*\|\s*100/));

out = E.processContent(L(
  '| K | V |', '| - | -: |', '| a | 0 |',
  '<!-- calc: V(1) = xfm("Catalogo","tasa_iva") * 100 -->'), { precision: 6 }, ext);
ok('xfm otra nota (0.21*100 = 21)', has(out, /a\s*\|\s*21/));

ok('sin externals -> degrada a 0', has(E.processContent(L(
  '| K | V |', '| - | -: |', '| a | 0 |',
  '<!-- calc: V(1) = xcell("NoExiste","t","c",1) -->'), { precision: 6 }, {}), /a\s*\|\s*0/));

// ===================== GRAFO / REFS =====================
ok('scanExternalRefs: dentro de calc capta', eq([...E.scanExternalRefs('<!-- calc: x = xcell("Fuente","t","c",1) -->')], ['Fuente']));
ok('scanExternalRefs: prosa NO capta', E.scanExternalRefs('texto `xcell("Nota","t","c",1)` ejemplo').size === 0);
ok('scanExternalRefs: fence NO capta', E.scanExternalRefs(L('```text','<!-- calc: x=xcell("Nota","t","c",1) -->','```')).size === 0);

ok('normNote: conserva ruta', E.normNote('A/Informe') === 'a/informe');
ok('normNote: homónimos distintos', E.normNote('Ventas/Inf') !== E.normNote('Compras/Inf'));
ok('normNote: quita .md', E.normNote('Sub/Nota.md') === 'sub/nota');

ok('parseWikilinks', eq(E.parseWikilinks('a "[[Cat]]" b "[[Otro|x]]"'), ['Cat','Otro']));

let p1 = E.upsertParents('| A | B |\n| - | - |\n| 1 |  |\n', ['Cat','Conf']);
ok('upsertParents: crea frontmatter', p1.startsWith('---\npadres:\n'));
ok('upsertParents: readParents lee de vuelta', eq(E.readParents(p1).sort(), ['Cat','Conf']));
ok('upsertParents: idempotente', E.upsertParents(p1, ['Conf','Cat']) === p1);
let p2 = E.upsertParents('---\ntitulo: X\n---\n\n| A | B |\n| - | - |\n| 1 |  |\n', ['F']);
ok('upsertParents: preserva otras claves', /titulo: X/.test(p2) && /\[\[F\]\]/.test(p2));
ok('upsertParents: quita la clave si no hay refs', !/padres:/.test(E.upsertParents(p2, [])));

// ===================== EDITOR (lógica pura) =====================
let c = E.mcEnclosingCall('  Resultado(1) = xcell("Pedido","tot');
ok('mcEnclosingCall: xcell arg1 tras nota', c.fn === 'xcell' && c.argIndex === 1 && c.inString && eq(c.prevArgs, ['Pedido']));
c = E.mcEnclosingCall('  M(1) = sumIf(xcol("Mayor","m","C');
ok('mcEnclosingCall: anidado (xcol en sumIf)', c.fn === 'xcol' && c.argIndex === 2 && eq(c.prevArgs, ['Mayor','m']));
c = E.mcEnclosingCall('  $Total = $Qty * su');
ok('mcEnclosingCall: sin paréntesis -> null', c === null);

ok('mcInCalc: escribiendo fórmula -> true', E.mcInCalc('| a | 0 |\n<!-- calc: Y(1) = xcell("C') === true);
ok('mcInCalc: en celda de datos -> false', E.mcInCalc('| a | ') === false);
ok('mcInCalc: tras cerrar -> false', E.mcInCalc('<!-- calc: Y=1 -->\n| b |') === false);

ok('mcColumnsAbove: cabecera correcta', eq(E.mcColumnsAbove((i)=>['| C1 | C2 |','| - | - |','| x | 0 |','<!-- calc: $C2=1 -->'][i], 3), ['C1','C2']));
ok('mcLocalNames: @name detectados', eq(E.mcLocalNames('@name = a ; @name=b'), ['a','b']));

// remapCursorCh: el cursor sobrevive al cambio de ancho de columna
ok('remapCursorCh: tras "12" sigue tras "12"', E.remapCursorCh('| 12 | 5 |', '| 12  | 100 |', 4) === 4);
ok('remapCursorCh: celda izq cambia ancho', E.remapCursorCh('| 12 | 5 |', '| 120 | 5 |', 8) === 9);

console.log('\n' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);

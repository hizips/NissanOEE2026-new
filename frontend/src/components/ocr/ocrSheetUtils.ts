import type { OcrFormSpec } from '@/services/ocrApi';

export const SHIFT_ORDER = ['N/S', 'D/S', 'A/S'];
export const DEFAULT_OCR_YEAR = 2025;
const OCR_YEAR_MIN = 2020;
const OCR_YEAR_MAX = 2030;

export function splitDateAndYear(
  raw: unknown,
  fallbackYear = DEFAULT_OCR_YEAR,
): { date: string | null; year: number } {
  const text = String(raw ?? '').trim();
  if (!text) return { date: null, year: fallbackYear };

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    return {
      date: `${Number(iso[2])}/${Number(iso[3])}`,
      year: y >= 1900 && y <= 2100 ? y : fallbackYear,
    };
  }

  const sep = text.includes('/') ? '/' : text.includes('-') ? '-' : null;
  if (sep) {
    const parts = text.split(sep).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      let y = parseInt(parts[parts.length - 1], 10);
      if (Number.isFinite(y)) {
        if (y < 100) y += 2000;
        if (y >= 1900 && y <= 2100) {
          return { date: parts.slice(0, -1).join(sep), year: y };
        }
      }
    }
  }

  return { date: text, year: fallbackYear };
}

export function parseHeaderYear(hdr: Record<string, unknown>): number {
  const explicit = Number(hdr.year);
  const fromDate = splitDateAndYear(hdr.date, DEFAULT_OCR_YEAR);
  if (String(hdr.date ?? '').trim()) {
    const raw = String(hdr.date).trim();
    const looksLikeYear =
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(raw) ||
      raw.split(/[/-]/).length >= 3;
    if (looksLikeYear) return fromDate.year;
  }
  if (Number.isFinite(explicit) && explicit >= 1900 && explicit <= 2100) return explicit;
  return fromDate.year;
}

function yearSelectHtml(path: string, selected: number): string {
  const years = new Set<number>();
  for (let y = OCR_YEAR_MIN; y <= OCR_YEAR_MAX; y++) years.add(y);
  if (selected >= 1900 && selected <= 2100) years.add(selected);
  let opts = '';
  for (const y of [...years].sort((a, b) => a - b)) {
    opts += `<option value="${y}"${y === selected ? ' selected' : ''}>${y}</option>`;
  }
  return `<select class="header-year-select" data-path="${escapeHtml(path)}" data-kind="year" aria-label="Year">${opts}</select>`;
}

export function escapeHtml(s: unknown): string {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function parseMaybeNumber(s: unknown): number | string | null {
  const t = String(s ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : t;
}

export function parseCont(s: unknown): boolean | null {
  const t = String(s ?? '').trim().toLowerCase();
  if (t === '') return null;
  if (t === 'yes' || t === 'true' || t === '1') return true;
  if (t === 'no' || t === 'false' || t === '0') return false;
  return null;
}

export function displayText(raw: unknown, kind: string): string {
  if (raw == null || raw === '') return '';
  if (kind === 'cont') {
    if (raw === true || raw === 'yes') return 'yes';
    if (raw === false || raw === 'no') return 'no';
    return '';
  }
  return String(raw);
}

export function cellHtml(
  path: string,
  value: unknown,
  kind = 'text',
  extraClass = '',
): string {
  const shown = displayText(value, kind);
  const dataVal =
    kind === 'cont' ? shown : value == null ? '' : String(value);
  const empty = shown === '' ? ' is-empty' : '';
  return `<div class="sheet-cell${empty}${extraClass ? ` ${extraClass}` : ''}" data-path="${escapeHtml(path)}" data-kind="${kind}" data-value="${escapeHtml(dataVal)}" tabindex="0"><span class="sheet-cell-display">${escapeHtml(shown)}</span></div>`;
}

export function orderedShifts(data: Record<string, unknown>): Record<string, unknown>[] {
  const shifts = (data.shifts as Record<string, unknown>[]) || [];
  const by: Record<string, Record<string, unknown>> = {};
  for (const sh of shifts) {
    if (sh?.shift) by[String(sh.shift)] = sh;
  }
  return SHIFT_ORDER.map((code) => {
    const src = by[code] || {};
    const entries = [...((src.downtime_entries as Record<string, unknown>[]) || [])];
    while (entries.length < 10) entries.push({});
    return {
      ...src,
      shift: code,
      downtime_entries: entries.slice(0, 10),
    };
  });
}

export function renderEditorHtml(
  formSpec: OcrFormSpec,
  data: Record<string, unknown>,
): string {
  const shifts = orderedShifts(data);
  const hdr = (data.header as Record<string, unknown>) || {};
  let html = `<div class="edit-section"><h3>Header</h3><div class="edit-grid">`;
  const headerYear = parseHeaderYear(hdr);
  const dateOnly = splitDateAndYear(hdr.date, headerYear).date;
  for (const f of formSpec.headerFields) {
    if (f.key === 'date') {
      html += `<label class="edit-field edit-field-date-year"><span>${escapeHtml(f.label)}</span>
        <div class="date-year-row">
          ${cellHtml(`header.${f.key}`, dateOnly, 'text', 'date-part')}
          ${yearSelectHtml('header.year', headerYear)}
        </div></label>`;
      continue;
    }
    html += `<label class="edit-field"><span>${escapeHtml(f.label)}</span>${cellHtml(
      `header.${f.key}`,
      hdr[f.key],
      'text',
    )}</label>`;
  }
  html += `</div></div>`;

  html += `<div class="edit-section"><h3>Downtime</h3>`;
  for (let si = 0; si < shifts.length; si++) {
    const sh = shifts[si];
    const idx = si;
    html += `<div class="shift-block"><h4>Shift ${escapeHtml(String(sh.shift || ''))}</h4>`;
    html += `<div class="edit-grid" style="margin-bottom:8px">`;
    for (const f of formSpec.shiftMetaFields) {
      const kind =
        f.key.includes('minutes') || f.key.includes('count') ? 'number' : 'text';
      html += `<label class="edit-field"><span>${escapeHtml(f.label)}</span>${cellHtml(
        `shifts.${idx}.${f.key}`,
        sh[f.key],
        kind,
      )}</label>`;
    }
    html += `</div><div class="edit-table-wrap"><table class="edit-table"><thead><tr>`;
    for (const f of formSpec.downtimeFields) {
      html += `<th>${escapeHtml(f.label)}</th>`;
    }
    html += `</tr></thead><tbody>`;
    const rows = (sh.downtime_entries as Record<string, unknown>[]) || [];
    for (let ri = 0; ri < rows.length; ri++) {
      const e = rows[ri];
      html += `<tr>`;
      for (const f of formSpec.downtimeFields) {
        const path = `shifts.${idx}.downtime_entries.${ri}.${f.key}`;
        if (f.key === 'reason_continued_from_previous') {
          html += `<td>${cellHtml(path, e[f.key], 'cont')}</td>`;
        } else {
          const kind =
            f.key.includes('minutes') || f.key === 'warmup_shot_count'
              ? 'number'
              : 'text';
          const cls = f.key === 'reason' ? 'reason-col' : '';
          html += `<td class="${cls}">${cellHtml(path, e[f.key], kind)}</td>`;
        }
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div></div>`;
  }
  html += `</div>`;

  html += `<div class="edit-section"><h3>Reject Data</h3><div class="edit-table-wrap"><table class="edit-table"><thead><tr>
      <th>Reason</th><th>N/S</th><th>D/S</th><th>A/S</th><th>Total</th></tr></thead><tbody>`;
  const rejects = (data.rejects as Record<string, unknown>[]) || [];
  rejects.forEach((r, i) => {
    html += `<tr><td>${escapeHtml(String(r.reason || ''))}</td>`;
    for (const k of formSpec.countKeys) {
      html += `<td>${cellHtml(`rejects.${i}.${k}`, r[k], 'number')}</td>`;
    }
    html += `</tr>`;
  });
  html += `<tr><th>Total Rejects</th>`;
  const totalRejects = (data.total_rejects as Record<string, unknown>) || {};
  for (const k of formSpec.countKeys) {
    html += `<td>${cellHtml(`total_rejects.${k}`, totalRejects[k], 'number')}</td>`;
  }
  html += `</tr></tbody></table></div></div>`;

  html += `<div class="edit-section"><h3>Cast Quantity / Machine Counter</h3><div class="edit-table-wrap"><table class="edit-table"><thead><tr>
      <th></th><th>N/S</th><th>D/S</th><th>A/S</th><th>Total</th></tr></thead><tbody>`;
  const machineCounter = (data.machine_counter as Record<string, Record<string, unknown>>) || {};
  for (const row of formSpec.counterRows) {
    const vals = machineCounter[row.key] || {};
    html += `<tr><td>${escapeHtml(row.label)}</td>`;
    for (const k of formSpec.countKeys) {
      html += `<td>${cellHtml(`machine_counter.${row.key}.${k}`, vals[k], 'number')}</td>`;
    }
    html += `</tr>`;
  }
  html += `</tbody></table></div></div>`;

  return html;
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> | unknown[] = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    const key = Number.isNaN(Number(p)) || String(Number(p)) !== p ? p : Number(p);
    const curObj = cur as Record<string, unknown>;
    if (curObj[key as string | number] == null) {
      curObj[key as string | number] =
        Number.isNaN(Number(next)) || String(Number(next)) !== next ? {} : [];
    }
    cur = curObj[key as string | number] as Record<string, unknown> | unknown[];
  }
  const last = parts[parts.length - 1];
  const lastKey =
    Number.isNaN(Number(last)) || String(Number(last)) !== last ? last : Number(last);
  (cur as Record<string, unknown>)[lastKey as string | number] = value;
}

export function getCellValue(cell: HTMLElement): string {
  return cell.dataset.value ?? '';
}

export function setCellValue(cell: HTMLElement, raw: unknown): void {
  const kind = cell.dataset.kind || 'text';
  let stored: string;
  if (kind === 'cont') {
    if (raw === true || raw === 'yes') stored = 'yes';
    else if (raw === false || raw === 'no') stored = 'no';
    else stored = '';
  } else if (raw == null) {
    stored = '';
  } else {
    stored = String(raw);
  }
  cell.dataset.value = stored;
  const shown = displayText(stored === '' ? null : stored, kind);
  cell.classList.toggle('is-empty', shown === '');
  const disp = cell.querySelector('.sheet-cell-display');
  if (disp) disp.textContent = shown;
}

export function exitEdit(cell: HTMLElement): void {
  if (!cell.classList.contains('editing')) return;
  const editor = cell.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
  const kind = cell.dataset.kind || 'text';
  let next: unknown = editor ? editor.value : getCellValue(cell);
  if (kind === 'cont') {
    next = parseCont(next) == null ? '' : displayText(parseCont(next), 'cont');
  }
  cell.classList.remove('editing');
  cell.innerHTML = '<span class="sheet-cell-display"></span>';
  setCellValue(cell, next === '' ? null : next);
}

export function enterEdit(cell: HTMLElement, root: HTMLElement): void {
  if (cell.classList.contains('editing')) return;
  root.querySelectorAll('.sheet-cell.editing').forEach((c) => exitEdit(c as HTMLElement));
  root.querySelectorAll('.sheet-cell.selected').forEach((c) => c.classList.remove('selected'));
  const kind = cell.dataset.kind || 'text';
  const cur = getCellValue(cell);
  cell.classList.remove('is-empty');
  cell.classList.add('editing');
  if (kind === 'cont') {
    cell.innerHTML = `<select>
        <option value=""></option>
        <option value="yes">yes</option>
        <option value="no">no</option>
      </select>`;
    const sel = cell.querySelector('select') as HTMLSelectElement;
    sel.value = cur;
    sel.focus();
    sel.addEventListener('blur', () => exitEdit(cell));
    sel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        sel.blur();
      }
    });
  } else {
    cell.innerHTML = `<input type="text" value="${escapeHtml(cur)}" />`;
    const inp = cell.querySelector('input') as HTMLInputElement;
    inp.focus();
    inp.select();
    inp.addEventListener('blur', () => exitEdit(cell));
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inp.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        inp.value = cur;
        inp.blur();
      }
    });
  }
}

export function collectFormFromDom(
  root: HTMLElement,
  currentMerged: Record<string, unknown>,
): Record<string, unknown> {
  root.querySelectorAll('.sheet-cell.editing').forEach((c) => exitEdit(c as HTMLElement));
  const out = JSON.parse(JSON.stringify(currentMerged)) as Record<string, unknown>;
  root.querySelectorAll('[data-path][data-kind="year"]').forEach((el) => {
    const sel = el as HTMLSelectElement;
    const path = sel.getAttribute('data-path');
    if (!path) return;
    setPath(out, path, Number(sel.value));
  });
  root.querySelectorAll('.sheet-cell[data-path]').forEach((el) => {
    const cell = el as HTMLElement;
    const path = cell.getAttribute('data-path');
    if (!path) return;
    const kind = cell.dataset.kind || 'text';
    let value: unknown = getCellValue(cell);
    if (kind === 'cont') {
      value = parseCont(value);
    } else if (kind === 'number') {
      value = parseMaybeNumber(value);
    } else {
      value = String(value ?? '').trim() === '' ? null : value;
    }
    setPath(out, path, value);
  });
  const rejects = out.rejects as Record<string, unknown>[] | undefined;
  const origRejects = currentMerged.rejects as Record<string, unknown>[] | undefined;
  if (rejects && origRejects) {
    rejects.forEach((r, i) => {
      r.reason = origRejects[i]?.reason;
    });
  }
  const shifts = out.shifts as Record<string, unknown>[] | undefined;
  const origShifts = currentMerged.shifts as Record<string, unknown>[] | undefined;
  if (shifts && origShifts) {
    shifts.forEach((s, i) => {
      s.shift = origShifts[i]?.shift;
    });
  }
  const hdr = (out.header as Record<string, unknown>) || {};
  const year = parseHeaderYear(hdr);
  const { date } = splitDateAndYear(hdr.date, year);
  hdr.date = date;
  hdr.year = year;
  out.header = hdr;
  return out;
}

function cellGroup(cell: HTMLElement): HTMLElement {
  return (
    (cell.closest('.edit-table') as HTMLElement) ||
    (cell.closest('.edit-grid') as HTMLElement) ||
    cell.parentElement!
  );
}

function indexGroup(group: HTMLElement) {
  const cells = [...group.querySelectorAll('.sheet-cell')] as HTMLElement[];
  const meta = new Map<HTMLElement, { row: number; col: number; group: HTMLElement }>();
  if (group.classList.contains('edit-table')) {
    const rows = [...group.querySelectorAll('tbody tr')];
    rows.forEach((tr, r) => {
      const rowCells = [...tr.querySelectorAll('.sheet-cell')] as HTMLElement[];
      rowCells.forEach((cell, c) => {
        meta.set(cell, { row: r, col: c, group });
      });
    });
  } else {
    cells.forEach((cell, i) => {
      meta.set(cell, { row: 0, col: i, group });
    });
  }
  return { cells, meta };
}

function cellAt(group: HTMLElement, row: number, col: number): HTMLElement | null {
  const { meta, cells } = indexGroup(group);
  for (const cell of cells) {
    const m = meta.get(cell);
    if (m && m.row === row && m.col === col) return cell;
  }
  return null;
}

function rectsIntersect(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function isClearCellsKey(e: KeyboardEvent): boolean {
  return e.key === 'Delete' || e.key === 'Backspace' || e.code === 'Delete' || e.code === 'Backspace';
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('.sheet-cell.editing')) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return Boolean(el.closest('input, select, textarea'));
}

export function bindSheetCells(root: HTMLElement): () => void {
  const abort = new AbortController();
  const { signal } = abort;
  if (!root.hasAttribute('tabindex')) root.tabIndex = -1;

  let mode: 'select' | 'move' | null = null;
  let startX = 0;
  let startY = 0;
  let marquee: HTMLDivElement | null = null;
  let grabCell: HTMLElement | null = null;
  let moved = false;
  let additive = false;
  let baseSelected = new Set<HTMLElement>();

  function removeMarquee() {
    if (marquee) {
      marquee.remove();
      marquee = null;
    }
  }

  function clearSelection() {
    root.querySelectorAll('.sheet-cell.selected').forEach((c) => c.classList.remove('selected'));
  }

  function selectedCells(): HTMLElement[] {
    return [...root.querySelectorAll('.sheet-cell.selected')] as HTMLElement[];
  }

  function selectFromMarquee(x: number, y: number) {
    if (!marquee) {
      marquee = document.createElement('div');
      marquee.className = 'selection-marquee';
      document.body.appendChild(marquee);
    }
    const left = Math.min(startX, x);
    const top = Math.min(startY, y);
    const width = Math.abs(x - startX);
    const height = Math.abs(y - startY);
    marquee.style.left = `${left}px`;
    marquee.style.top = `${top}px`;
    marquee.style.width = `${width}px`;
    marquee.style.height = `${height}px`;
    const selRect = { left, top, right: left + width, bottom: top + height };

    clearSelection();
    baseSelected.forEach((c) => c.classList.add('selected'));
    root.querySelectorAll('.sheet-cell').forEach((cell) => {
      const el = cell as HTMLElement;
      if (el.classList.contains('editing')) return;
      const r = el.getBoundingClientRect();
      if (rectsIntersect(selRect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) {
        el.classList.add('selected');
      }
    });
  }

  function clearDropTargets() {
    root.querySelectorAll('.sheet-cell.drop-target, .sheet-cell.moving').forEach((c) => {
      c.classList.remove('drop-target', 'moving');
    });
  }

  function applyMove(dropCell: HTMLElement) {
    if (!grabCell || !dropCell || grabCell === dropCell) return;
    const group = cellGroup(grabCell);
    if (cellGroup(dropCell) !== group) return;
    const { meta } = indexGroup(group);
    const grabMeta = meta.get(grabCell);
    const dropMeta = meta.get(dropCell);
    if (!grabMeta || !dropMeta) return;

    const selected = selectedCells().filter((c) => cellGroup(c) === group);
    if (!selected.length) return;

    const dRow = dropMeta.row - grabMeta.row;
    const dCol = dropMeta.col - grabMeta.col;

    const moves: { src: HTMLElement; dest: HTMLElement; value: string }[] = [];
    for (const src of selected) {
      const m = meta.get(src);
      if (!m) continue;
      const dest = cellAt(group, m.row + dRow, m.col + dCol);
      if (!dest || dest.classList.contains('editing')) continue;
      moves.push({ src, dest, value: getCellValue(src) });
    }
    if (!moves.length) return;

    for (const mv of moves) setCellValue(mv.src, null);
    for (const mv of moves) setCellValue(mv.dest, mv.value === '' ? null : mv.value);

    clearSelection();
    moves.forEach((mv) => mv.dest.classList.add('selected'));
  }

  root.querySelectorAll('.sheet-cell').forEach((cell) => {
    cell.addEventListener(
      'dblclick',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        enterEdit(cell as HTMLElement, root);
      },
      { signal },
    );
  });

  root.addEventListener(
    'mousedown',
    (e) => {
      const me = e as MouseEvent;
      if (me.button !== 0) return;
      if ((me.target as HTMLElement).closest('input, select')) return;
      const cell = (me.target as HTMLElement).closest('.sheet-cell') as HTMLElement | null;
      if (cell?.classList.contains('editing')) return;

      root.querySelectorAll('.sheet-cell.editing').forEach((c) => exitEdit(c as HTMLElement));

      startX = me.clientX;
      startY = me.clientY;
      moved = false;
      additive = me.ctrlKey || me.metaKey;
      grabCell = cell;

      if (cell?.classList.contains('selected') && !additive) {
        mode = 'move';
        root.classList.add('moving');
        selectedCells().forEach((c) => c.classList.add('moving'));
      } else {
        mode = 'select';
        root.classList.add('selecting');
        baseSelected = additive ? new Set(selectedCells()) : new Set();
        if (!additive) clearSelection();
        if (cell) cell.classList.add('selected');
      }

      me.preventDefault();
      root.focus({ preventScroll: true });
    },
    { signal },
  );

  window.addEventListener(
    'mousemove',
    (e) => {
      if (!mode) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

      if (mode === 'select') {
        selectFromMarquee(e.clientX, e.clientY);
      } else if (mode === 'move') {
        clearDropTargets();
        selectedCells().forEach((c) => c.classList.add('moving'));
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const over = el?.closest('.sheet-cell') as HTMLElement | null;
        if (over && grabCell && cellGroup(over) === cellGroup(grabCell)) {
          over.classList.add('drop-target');
        }
      }
    },
    { signal },
  );

  window.addEventListener(
    'mouseup',
    (e) => {
      if (!mode) return;
      if (mode === 'select') {
        if (moved) selectFromMarquee(e.clientX, e.clientY);
        else if (grabCell && !additive) {
          clearSelection();
          grabCell.classList.add('selected');
        }
        removeMarquee();
        root.classList.remove('selecting');
      } else if (mode === 'move') {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const over = el?.closest('.sheet-cell') as HTMLElement | null;
        if (moved && over) applyMove(over);
        clearDropTargets();
        root.classList.remove('moving');
      }
      mode = null;
      grabCell = null;
      moved = false;
      baseSelected = new Set();
    },
    { signal },
  );

  function onClearKeys(e: KeyboardEvent) {
    if (!isClearCellsKey(e)) return;
    if (isTypingTarget(e.target)) return;
    if (root.querySelector('.sheet-cell.editing')) return;
    const selected = selectedCells();
    if (!selected.length) return;
    e.preventDefault();
    e.stopPropagation();
    selected.forEach((cell) => setCellValue(cell, null));
  }

  root.addEventListener('keydown', onClearKeys, { signal });
  window.addEventListener('keydown', onClearKeys, { signal, capture: true });

  return () => abort.abort();
}

export function prepareMergedData(data: Record<string, unknown>): Record<string, unknown> {
  const header = { ...((data.header as Record<string, unknown>) || {}) };
  const year = parseHeaderYear(header);
  const { date } = splitDateAndYear(header.date, year);
  header.date = date;
  header.year = year;
  return { ...data, header, shifts: orderedShifts(data) };
}

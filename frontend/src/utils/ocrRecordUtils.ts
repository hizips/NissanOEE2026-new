/** Helpers for shift records created via OCR import. */

const OCR_IMPORT_FROM_RE = /^OCR import from (.+)$/i;
const OCR_DOWNTIME_FROM_RE = /^OCR downtime import from (.+)$/i;

export function isOcrImportedRecord(notes?: string | null): boolean {
  if (!notes) return false;
  const t = notes.trim();
  return t.startsWith('OCR import') || t.startsWith('OCR downtime import');
}

export function parseOcrJobIdFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const t = notes.trim();
  let m = t.match(OCR_IMPORT_FROM_RE);
  if (m) return m[1].trim();
  m = t.match(OCR_DOWNTIME_FROM_RE);
  if (m) return m[1].trim();
  return null;
}

export function parseOcrJobIdFromRecord(record: {
  notes?: string | null;
  ocrJobId?: string | null;
}): string | null {
  const fromField = record.ocrJobId?.trim();
  if (fromField) return fromField;
  return parseOcrJobIdFromNotes(record.notes);
}

/** Calendar date only, so `2025-01-05` matches `2025-01-05T00:00:00Z`. */
export function calendarDate(value?: string | null): string {
  if (!value) return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(value);
}

type ShiftScope = {
  machineId: string;
  date: string;
  shift: string;
  operatorName: string;
  ocrJobId?: string | null;
  notes?: string | null;
};

/** Tie part/downtime rows to one shift. OCR rows prefer job id + shift. */
export function matchesShiftRecord(record: ShiftScope, item: ShiftScope): boolean {
  if (item.shift !== record.shift) return false;
  const recJob = parseOcrJobIdFromRecord(record);
  const itemJob = parseOcrJobIdFromRecord(item);
  if (recJob && itemJob) return recJob === itemJob;
  return (
    item.machineId === record.machineId &&
    calendarDate(item.date) === calendarDate(record.date) &&
    item.operatorName === record.operatorName
  );
}

export function ocrImportLabel(notes?: string | null): string {
  const jobId = parseOcrJobIdFromNotes(notes);
  if (jobId) return `OCR import · ${jobId}`;
  if (isOcrImportedRecord(notes)) return 'OCR import';
  return '';
}

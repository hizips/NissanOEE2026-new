import { getApiBaseUrl } from './apiBase';
import { isUnauthorizedResponse, waitForReauth } from './authSession';

const API_BASE_URL = getApiBaseUrl();

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = sessionStorage.getItem('oee-auth-token');
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function ocrFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  const url = `${API_BASE_URL}/ocr${endpoint}`;
  const headers = authHeaders(options.headers as Record<string, string> | undefined);

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  } else if (!headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const errorBody = await response.text();
    if (!retried && isUnauthorizedResponse(response.status, errorBody)) {
      sessionStorage.removeItem('oee-auth-token');
      await waitForReauth();
      return ocrFetch<T>(endpoint, options, true);
    }
    if (isUnauthorizedResponse(response.status, errorBody)) {
      sessionStorage.removeItem('oee-auth-token');
      sessionStorage.removeItem('oee-authenticated');
    }
    throw new Error(errorBody || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  const ct = response.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return response as unknown as T;
}

export async function fetchOcrBlobUrl(endpoint: string, retried = false): Promise<string> {
  const url = `${API_BASE_URL}/ocr${endpoint}`;
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    if (!retried && isUnauthorizedResponse(response.status, errorBody)) {
      sessionStorage.removeItem('oee-auth-token');
      await waitForReauth();
      return fetchOcrBlobUrl(endpoint, true);
    }
    throw new Error(`Failed to load image: ${response.status}`);
  }
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export type OcrImportStatus = 'not_imported' | 'imported' | 'stale';

export interface OcrJob {
  id: string;
  name: string;
  status: string;
  stage: string;
  originalFilename?: string;
  convertMode?: string;
  extractionMode?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  durationSeconds?: number;
  costCents?: number;
  costBreakdown?: Record<string, number>;
  convertCostCents?: number;
  downtimeCostCents?: number;
  rejectsCostCents?: number;
  error?: string;
  hasOriginalPng?: boolean;
  hasMergedJson?: boolean;
  importStatus?: OcrImportStatus;
  importedAt?: string;
  lastImportRejects?: boolean;
  lastImportDowntime?: boolean;
}

export interface OcrUploadMeta {
  id: string;
  pageCount: number;
  originalFilename: string;
}

export interface OcrFormSpec {
  headerFields: { key: string; label: string }[];
  shiftMetaFields: { key: string; label: string }[];
  downtimeFields: { key: string; label: string }[];
  counterRows: { key: string; label: string }[];
  countKeys: string[];
}

export interface OcrOptions {
  convertModes: string[];
  extractionModes: string[];
  defaults: { convertMode: string; extractionMode: string };
  form: OcrFormSpec;
  queueDepth: number;
}

export const ocrApi = {
  getOptions: () => ocrFetch<OcrOptions>('/options/'),

  listJobs: () => ocrFetch<OcrJob[]>('/jobs/'),

  reconcileJobs: (opts?: { fetchDatalab?: boolean; requeue?: boolean }) =>
    ocrFetch<{
      summary: {
        synced: number;
        healed: string[];
        datalab: { jobId: string; notes: string[] }[];
        requeued: string[];
        errors: string[];
        inProgress: number;
        ready: number;
      };
      jobs: OcrJob[];
    }>('/jobs/reconcile/', {
      method: 'POST',
      body: JSON.stringify({
        fetchDatalab: opts?.fetchDatalab ?? true,
        requeue: opts?.requeue ?? true,
      }),
    }),

  getJob: (jobId: string) => ocrFetch<OcrJob>(`/jobs/${encodeURIComponent(jobId)}/`),

  deleteJob: (jobId: string) =>
    ocrFetch<void>(`/jobs/${encodeURIComponent(jobId)}/`, { method: 'DELETE' }),

  startJobs: (payload: {
    uploadId: string;
    pages: number[];
    convertMode: string;
    extractionMode: string;
  }) =>
    ocrFetch<{ jobs: OcrJob[] }>('/jobs/start/', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMerged: (jobId: string) =>
    ocrFetch<{ merged: Record<string, unknown> }>(
      `/jobs/${encodeURIComponent(jobId)}/merged.json`,
    ),

  saveMerged: (jobId: string, merged: Record<string, unknown>) =>
    ocrFetch<{ merged: Record<string, unknown>; job?: OcrJob }>(
      `/jobs/${encodeURIComponent(jobId)}/merged.json`,
      {
        method: 'PUT',
        body: JSON.stringify({ merged }),
      },
    ),

  revert: (jobId: string) =>
    ocrFetch<{ merged: Record<string, unknown> }>(
      `/jobs/${encodeURIComponent(jobId)}/revert/`,
      { method: 'POST' },
    ),

  importJob: (
    jobId: string,
    opts: { importRejects: boolean; importDowntime: boolean; operatorName?: string },
  ) =>
    ocrFetch<{ result: unknown; importStatus: OcrImportStatus }>(
      `/jobs/${encodeURIComponent(jobId)}/import/`,
      {
        method: 'POST',
        body: JSON.stringify({
          importRejects: opts.importRejects,
          importDowntime: opts.importDowntime,
          operatorName: opts.operatorName ?? 'unknown',
        }),
      },
    ),

  setImportStatus: (jobId: string, importStatus: 'imported' | 'not_imported') =>
    ocrFetch<OcrJob>(`/jobs/${encodeURIComponent(jobId)}/import-status/`, {
      method: 'PATCH',
      body: JSON.stringify({ importStatus }),
    }),

  batchImport: (
    jobIds: string[],
    opts: { importRejects: boolean; importDowntime: boolean; operatorName?: string },
  ) =>
    ocrFetch<{ results: { jobId: string; ok: boolean; error?: string }[] }>(
      '/jobs/batch-import/',
      {
        method: 'POST',
        body: JSON.stringify({
          jobIds,
          importRejects: opts.importRejects,
          importDowntime: opts.importDowntime,
          operatorName: opts.operatorName ?? 'unknown',
        }),
      },
    ),

  uploadPdf: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return ocrFetch<OcrUploadMeta>('/uploads/', { method: 'POST', body: fd });
  },

  deleteUpload: (uploadId: string) =>
    ocrFetch<void>(`/uploads/${encodeURIComponent(uploadId)}/`, { method: 'DELETE' }),
};

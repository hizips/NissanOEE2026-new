import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Upload,
  RefreshCw,
  Trash2,
  Save,
  RotateCcw,
  FileInput,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  fetchOcrBlobUrl,
  ocrApi,
  type OcrFormSpec,
  type OcrImportStatus,
  type OcrJob,
  type OcrOptions,
} from '@/services/ocrApi';

import { OcrSheetEditor, type OcrSheetEditorHandle } from './OcrSheetEditor';

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued',
  rendering_original: 'Rendering scan',
  converting: 'OCR convert',
  extracting_downtime: 'Extract downtime',
  extracting_rejects: 'Extract rejects',
  renaming: 'Renaming',
  done: 'Done',
  failed: 'Failed',
};

function stageLabel(job: OcrJob | null): string {
  if (!job) return '';
  return STAGE_LABELS[job.stage] || job.stage || job.status;
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—';
  const s = Math.max(0, Number(seconds));
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${(s - m * 60).toFixed(0)}s`;
}

function formatCents(cents?: number | null): string {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  const n = Number(cents);
  return n >= 100 ? `$${(n / 100).toFixed(2)}` : `${n}¢`;
}

function jobStatusBadge(status: string, stage: string): { className: string; label: string } {
  if (status === 'done') return { className: 'bg-green-600 text-white', label: 'Done' };
  if (status === 'failed') return { className: 'bg-red-600 text-white', label: 'Failed' };
  if (status === 'queued') return { className: 'bg-slate-500 text-white', label: 'Queued' };
  return { className: 'bg-amber-500 text-white', label: STAGE_LABELS[stage] || stage || 'Running' };
}

function importStatusBadge(
  status: OcrImportStatus | undefined,
  jobDone: boolean,
): { className: string; label: string } | null {
  if (!jobDone) return null;
  if (status === 'imported') return { className: 'bg-green-600 text-white', label: 'Imported' };
  if (status === 'stale') return { className: 'bg-orange-500 text-white', label: 'Stale — re-import' };
  return { className: 'bg-red-600 text-white', label: 'Not imported' };
}

function parseError(err: unknown): string {
  const msg = String((err as Error)?.message || err);
  try {
    const parsed = JSON.parse(msg);
    if (parsed.detail) return String(parsed.detail);
  } catch {
    /* plain text */
  }
  return msg;
}

interface StagedUpload {
  id: string;
  pageCount: number;
  originalFilename: string;
  selected: Set<number>;
}

export function OcrImport({ active = true }: { active?: boolean }) {
  const [options, setOptions] = useState<OcrOptions | null>(null);
  const [formSpec, setFormSpec] = useState<OcrFormSpec | null>(null);
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<OcrJob | null>(null);
  const [merged, setMerged] = useState<Record<string, unknown> | null>(null);
  const [stagedUpload, setStagedUpload] = useState<StagedUpload | null>(null);
  const [view, setView] = useState<'empty' | 'staging' | 'job'>('empty');
  const [convertMode, setConvertMode] = useState('accurate');
  const [extractionMode, setExtractionMode] = useState('fast');
  const [importRejects, setImportRejects] = useState(true);
  const [importDowntime, setImportDowntime] = useState(true);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [originalImg, setOriginalImg] = useState<string | null>(null);
  const [pageThumbs, setPageThumbs] = useState<Record<number, string>>({});
  const [loadingJob, setLoadingJob] = useState(false);

  const [reconciling, setReconciling] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<OcrSheetEditorHandle>(null);
  const selectedIdRef = useRef<string | null>(null);
  const selectedJobRef = useRef<OcrJob | null>(null);

  selectedIdRef.current = selectedId;
  selectedJobRef.current = selectedJob;

  const refreshHistory = useCallback(async () => {
    const list = await ocrApi.listJobs();
    setJobs(list);
  }, []);

  const reconcileAndRefresh = useCallback(async (opts?: { quiet?: boolean }) => {
    setReconciling(true);
    try {
      const result = await ocrApi.reconcileJobs();
      setJobs(result.jobs);
      const s = result.summary;
      const healed = s.healed?.length || 0;
      const requeued = s.requeued?.length || 0;
      const datalab = s.datalab?.length || 0;
      const errors = s.errors?.length || 0;
      if (opts?.quiet) {
        if (healed || requeued) {
          toast.success(
            `OCR jobs updated${healed ? ` · healed ${healed}` : ''}${requeued ? ` · resumed ${requeued}` : ''}`,
          );
        }
      } else if (healed || requeued || datalab) {
        toast.success(
          `Synced jobs${healed ? ` · healed ${healed}` : ''}${requeued ? ` · resumed ${requeued}` : ''}${datalab ? ` · checked Datalab on ${datalab}` : ''}`,
        );
      } else if (errors) {
        toast.message(`History refreshed (${errors} note${errors === 1 ? '' : 's'})`);
      } else {
        toast.success('History refreshed');
      }
      if (errors && s.errors?.[0]) {
        console.warn('OCR reconcile:', s.errors);
      }
    } catch (e) {
      if (!opts?.quiet) toast.error(parseError(e) || 'Could not refresh OCR jobs');
      await refreshHistory().catch(() => {});
    } finally {
      setReconciling(false);
    }
  }, [refreshHistory]);

  const loadOptions = useCallback(async () => {
    const opts = await ocrApi.getOptions();
    setOptions(opts);
    setFormSpec(opts.form);
    setConvertMode(opts.defaults.convertMode);
    setExtractionMode(opts.defaults.extractionMode);
  }, []);

  useEffect(() => {
    if (!active) return;
    loadOptions().catch((e) => toast.error(parseError(e)));
    reconcileAndRefresh({ quiet: true }).catch(() => {});
  }, [active, loadOptions, reconcileAndRefresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      refreshHistory().catch(() => {});
      const id = selectedIdRef.current;
      const job = selectedJobRef.current;
      if (id && job && job.status !== 'done' && job.status !== 'failed') {
        refreshJob(id, false).catch(() => {});
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [refreshHistory]);

  useEffect(() => {
    return () => {
      if (originalImg?.startsWith('blob:')) URL.revokeObjectURL(originalImg);
      Object.values(pageThumbs).forEach((u) => {
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
    };
  }, [originalImg, pageThumbs]);

  async function loadOriginalImage(job: OcrJob) {
    if (originalImg?.startsWith('blob:')) URL.revokeObjectURL(originalImg);
    setOriginalImg(null);
    if (!job.hasOriginalPng) return;
    const bust = job.updatedAt || Date.now();
    const url = await fetchOcrBlobUrl(
      `/jobs/${encodeURIComponent(job.id)}/original.png?t=${encodeURIComponent(String(bust))}`,
    );
    setOriginalImg(url);
  }

  async function loadMergedForJob(job: OcrJob) {
    if (job.status !== 'done' || !job.hasMergedJson) {
      setMerged(null);
      return;
    }
    const data = await ocrApi.getMerged(job.id);
    setMerged(data.merged);
  }

  async function refreshJob(id: string, resetImage: boolean) {
    setLoadingJob(true);
    try {
      const job = await ocrApi.getJob(id);
      setSelectedId(job.id);
      setSelectedJob(job);
      setView('job');

      if (resetImage || job.hasOriginalPng) {
        await loadOriginalImage(job).catch(() => {});
      }

      await loadMergedForJob(job);
      await refreshHistory();
    } catch (e) {
      toast.error(parseError(e) || 'Could not load job');
    } finally {
      setLoadingJob(false);
    }
  }

  async function selectJob(id: string) {
    await refreshJob(id, true);
  }

  async function stageFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Upload a PDF scan');
      return;
    }
    toast.message(`Uploading ${file.name}…`);
    const meta = await ocrApi.uploadPdf(file);
    setStagedUpload({
      id: meta.id,
      pageCount: meta.pageCount,
      originalFilename: meta.originalFilename,
      selected: new Set(Array.from({ length: meta.pageCount }, (_, i) => i + 1)),
    });
    setView('staging');

    const thumbs: Record<number, string> = {};
    for (let p = 1; p <= meta.pageCount; p++) {
      thumbs[p] = await fetchOcrBlobUrl(
        `/uploads/${encodeURIComponent(meta.id)}/pages/${p}.png`,
      );
    }
    setPageThumbs(thumbs);
  }

  async function cancelStaging(deleteRemote: boolean) {
    if (deleteRemote && stagedUpload) {
      await ocrApi.deleteUpload(stagedUpload.id).catch(() => {});
    }
    Object.values(pageThumbs).forEach((u) => {
      if (u.startsWith('blob:')) URL.revokeObjectURL(u);
    });
    setPageThumbs({});
    setStagedUpload(null);
    setView('empty');
  }

  async function startStagedJobs() {
    if (!stagedUpload) return;
    const pages = [...stagedUpload.selected].sort((a, b) => a - b);
    if (!pages.length) {
      toast.error('Select at least one page');
      return;
    }
    const result = await ocrApi.startJobs({
      uploadId: stagedUpload.id,
      pages,
      convertMode,
      extractionMode,
    });
    setStagedUpload(null);
    setPageThumbs({});
    await refreshHistory();
    if (result.jobs.length) {
      await selectJob(result.jobs[0].id);
      toast.success(result.jobs.length === 1 ? 'OCR job started' : `${result.jobs.length} OCR jobs started`);
    } else {
      setView('empty');
    }
  }

  async function saveMerged() {
    if (!selectedId || !editorRef.current) return;
    const payload = editorRef.current.collectForm();
    if (!payload) return;
    const saved = await ocrApi.saveMerged(selectedId, payload);
    setMerged(saved.merged);
    // Save response uses plain JSON (snake_case job fields); reload via detail API for full camelCase job.
    const jobId = (saved.job as { id?: string } | undefined)?.id ?? selectedId;
    await refreshJob(jobId, false);
    toast.success('Saved');
  }

  async function revertMerged() {
    if (!selectedId) return;
    if (!confirm('Revert all edits back to the original OCR extraction?')) return;
    const result = await ocrApi.revert(selectedId);
    setMerged(result.merged);
    toast.success('Reverted to original OCR data');
    await refreshJob(selectedId, false);
  }

  async function importCurrentJob() {
    if (!selectedId) return;
    await ocrApi.importJob(selectedId, { importRejects, importDowntime });
    toast.success('Imported into production database');
    await refreshJob(selectedId, false);
  }

  async function setJobImportFlag(jobId: string, imported: boolean) {
    const job = await ocrApi.setImportStatus(jobId, imported ? 'imported' : 'not_imported');
    setJobs((prev) => prev.map((j) => (j.id === job.id || j.id === jobId ? { ...j, ...job } : j)));
    if (selectedId === jobId || selectedId === job.id) {
      setSelectedId(job.id);
      setSelectedJob(job);
    }
    toast.success(imported ? 'Marked as imported' : 'Marked as not imported');
    await refreshHistory();
  }

  async function batchImport() {
    const ids = [...batchSelected];
    if (!ids.length) {
      toast.error('Select jobs to import');
      return;
    }
    const result = await ocrApi.batchImport(ids, { importRejects, importDowntime });
    const ok = result.results.filter((r) => r.ok).length;
    const fail = result.results.filter((r) => !r.ok).length;
    toast.message(`Batch import: ${ok} succeeded${fail ? `, ${fail} failed` : ''}`);
    await refreshHistory();
    if (selectedId) await refreshJob(selectedId, false);
  }

  async function deleteJob() {
    if (!selectedId) return;
    if (!confirm('Delete this job and its saved files?')) return;
    await ocrApi.deleteJob(selectedId);
    setSelectedId(null);
    setSelectedJob(null);
    setMerged(null);
    setOriginalImg(null);
    setView('empty');
    await refreshHistory();
    toast.success('Deleted');
  }

  function toggleBatchJob(id: string) {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6 w-full max-w-none">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] w-full">
        {/* Sidebar */}
        <Card className="lg:row-span-2 h-fit lg:sticky lg:top-4 border-slate-200">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-lg text-slate-900">Jobs</CardTitle>
            <CardDescription className="text-slate-600">Upload PDFs and manage OCR history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) stageFile(f).catch((err) => toast.error(parseError(err)));
              }}
            />
            <Button className="w-full gap-2 bg-slate-950 text-white hover:bg-slate-800" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Upload PDF
            </Button>

            <div className="space-y-2">
              <Label className="text-slate-700">Convert mode</Label>
              <Select value={convertMode} onValueChange={setConvertMode}>
                <SelectTrigger className="bg-white border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(options?.convertModes || ['accurate', 'balanced', 'fast']).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Extraction mode</Label>
              <Select value={extractionMode} onValueChange={setExtractionMode}>
                <SelectTrigger className="bg-white border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(options?.extractionModes || ['fast', 'balanced', 'turbo']).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-sm font-semibold text-slate-800">Import options</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="import-rejects"
                  checked={importRejects}
                  onCheckedChange={(v) => setImportRejects(v === true)}
                />
                <Label htmlFor="import-rejects" className="font-normal cursor-pointer text-slate-700">
                  Rejects & production counts
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="import-downtime"
                  checked={importDowntime}
                  onCheckedChange={(v) => setImportDowntime(v === true)}
                />
                <Label htmlFor="import-downtime" className="font-normal cursor-pointer text-slate-700">
                  Downtime events
                </Label>
              </div>
              <Button variant="outline" className="w-full gap-2 border-slate-300 text-slate-800 hover:bg-slate-50" onClick={() => batchImport().catch((e) => toast.error(parseError(e)))}>
                <FileInput className="h-4 w-4" />
                Batch import ({batchSelected.size})
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold text-slate-800">History</Label>
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-600 hover:text-slate-900 gap-1"
                disabled={reconciling}
                title="Refresh and resume any stuck OCR jobs (checks local files + Datalab)"
                onClick={() => reconcileAndRefresh().catch(() => {})}
              >
                <RefreshCw className={`h-4 w-4 ${reconciling ? 'animate-spin' : ''}`} />
                {reconciling ? 'Syncing…' : 'Refresh'}
              </Button>
            </div>

            <ScrollArea className="h-[min(420px,40vh)] pr-2">
              <div className="space-y-3">
                {!jobs.length && (
                  <p className="text-sm text-slate-500 py-4 text-center">No jobs yet</p>
                )}
                {(() => {
                  const inProgress = jobs.filter((j) => j.status !== 'done' && j.status !== 'failed');
                  const ready = jobs.filter((j) => j.status === 'done' || j.status === 'failed');
                  const renderJob = (job: OcrJob) => {
                    const status = jobStatusBadge(job.status, job.stage);
                    const importBadge = importStatusBadge(job.importStatus, job.status === 'done');
                    return (
                      <div key={job.id} className="flex items-start gap-2">
                        {job.status === 'done' && job.hasMergedJson && (
                          <Checkbox
                            className="mt-3 border-slate-400"
                            checked={batchSelected.has(job.id)}
                            onCheckedChange={() => toggleBatchJob(job.id)}
                          />
                        )}
                        <div
                          className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
                            job.id === selectedId
                              ? 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-200'
                              : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => selectJob(job.id).catch((e) => toast.error(parseError(e)))}
                            className="w-full text-left"
                          >
                            <div className="font-medium text-sm leading-snug text-slate-900">{job.name || job.id}</div>
                          </button>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <Badge className={`${status.className} text-xs px-2 py-0.5`}>
                              {status.label}
                            </Badge>
                            {importBadge && (
                              <button
                                type="button"
                                title={
                                  job.importStatus === 'imported' || job.importStatus === 'stale'
                                    ? 'Mark as not imported'
                                    : 'Mark as imported'
                                }
                                onClick={() =>
                                  setJobImportFlag(
                                    job.id,
                                    !(job.importStatus === 'imported' || job.importStatus === 'stale'),
                                  ).catch((e) => toast.error(parseError(e)))
                                }
                              >
                                <Badge className={`${importBadge.className} text-xs px-2 py-0.5 cursor-pointer`}>
                                  {importBadge.label}
                                </Badge>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  };
                  return (
                    <>
                      {inProgress.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-0.5">
                            In progress ({inProgress.length})
                          </p>
                          {inProgress.map(renderJob)}
                        </div>
                      )}
                      {ready.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 px-0.5">
                            Ready ({ready.filter((j) => j.status === 'done').length})
                            {ready.some((j) => j.status === 'failed')
                              ? ` · Failed (${ready.filter((j) => j.status === 'failed').length})`
                              : ''}
                          </p>
                          {ready.map(renderJob)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Main workspace */}
        <div className="space-y-4 min-w-0 w-full">
          {view === 'empty' && (
            <Card className="border-dashed border-slate-300">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Upload className="h-12 w-12 text-slate-400 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Import a production sheet</h3>
                <p className="text-slate-600 max-w-md mb-6">
                  Upload a scanned daily production sheet PDF. OCR runs on the server — review and
                  edit the spreadsheet before importing.
                </p>
                <Button className="bg-slate-950 text-white hover:bg-slate-800" onClick={() => fileInputRef.current?.click()}>
                  Choose PDF
                </Button>
              </CardContent>
            </Card>
          )}

          {view === 'staging' && stagedUpload && (
            <Card className="border-slate-200">
              <CardHeader className="border-b border-slate-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-slate-900">{stagedUpload.originalFilename}</CardTitle>
                    <CardDescription className="text-slate-600">
                      {stagedUpload.pageCount === 1
                        ? '1 page ready — click Start OCR'
                        : `${stagedUpload.pageCount} pages — select which to process`}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-300"
                      onClick={() =>
                        setStagedUpload((u) =>
                          u
                            ? {
                                ...u,
                                selected: new Set(Array.from({ length: u.pageCount }, (_, i) => i + 1)),
                              }
                            : u,
                        )
                      }
                    >
                      All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-slate-300"
                      onClick={() => setStagedUpload((u) => (u ? { ...u, selected: new Set() } : u))}
                    >
                      None
                    </Button>
                    <Button variant="outline" size="sm" className="border-slate-300" onClick={() => cancelStaging(true).catch(() => {})}>
                      Cancel
                    </Button>
                    <Button size="sm" className="bg-slate-950 text-white hover:bg-slate-800" onClick={() => startStagedJobs().catch((e) => toast.error(parseError(e)))}>
                      Start OCR
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {Array.from({ length: stagedUpload.pageCount }, (_, i) => i + 1).map((p) => {
                    const selected = stagedUpload.selected.has(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setStagedUpload((u) => {
                            if (!u) return u;
                            const next = new Set(u.selected);
                            if (next.has(p)) next.delete(p);
                            else next.add(p);
                            return { ...u, selected: next };
                          });
                        }}
                        className={`rounded-lg border-2 p-2 text-left transition-colors bg-white ${
                          selected
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                            : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        {pageThumbs[p] ? (
                          <img src={pageThumbs[p]} alt={`Page ${p}`} className="w-full rounded object-contain aspect-[3/4] bg-slate-100 border border-slate-200" />
                        ) : (
                          <div className="aspect-[3/4] bg-slate-100 rounded border border-slate-200" />
                        )}
                        <div className="mt-2 text-sm font-medium text-slate-800">Page {p}</div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {view === 'job' && selectedJob && (
            <div className="flex min-h-0 flex-col gap-4" style={{ height: 'calc(100vh - 11rem)' }}>
              <Card className="shrink-0 border-slate-200">
                <CardHeader className="py-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="truncate text-slate-900">{selectedJob.name || selectedJob.id}</CardTitle>
                      <CardDescription className="mt-1 text-slate-600">
                        {selectedJob.originalFilename && `${selectedJob.originalFilename} · `}
                        {selectedJob.convertMode}/{selectedJob.extractionMode}
                        {importStatusBadge(selectedJob.importStatus, selectedJob.status === 'done') && (
                          <> · {importStatusBadge(selectedJob.importStatus, selectedJob.status === 'done')!.label}</>
                        )}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 shrink-0">
                      {(selectedJob.durationSeconds != null || selectedJob.costCents != null) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-xs text-slate-500">Duration</span>
                            <span className="font-semibold text-slate-900">{formatDuration(selectedJob.durationSeconds)}</span>
                          </span>
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <DollarSign className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-xs text-slate-500">Total</span>
                            <span className="font-semibold text-slate-900">{formatCents(selectedJob.costCents)}</span>
                          </span>
                          <span className="whitespace-nowrap">
                            <span className="text-xs text-slate-500">Convert </span>
                            <span className="font-semibold text-slate-900">
                              {formatCents(selectedJob.costBreakdown?.convertCents ?? selectedJob.convertCostCents)}
                            </span>
                          </span>
                          <span className="whitespace-nowrap">
                            <span className="text-xs text-slate-500">Extract </span>
                            <span className="font-semibold text-slate-900">
                              {formatCents(
                                (selectedJob.costBreakdown?.downtimeExtractCents ?? selectedJob.downtimeCostCents ?? 0) +
                                  (selectedJob.costBreakdown?.rejectsExtractCents ?? selectedJob.rejectsCostCents ?? 0),
                              )}
                            </span>
                          </span>
                        </div>
                      )}
                      {(() => {
                        const sb = jobStatusBadge(selectedJob.status, selectedJob.stage);
                        return (
                          <Badge className={`${sb.className} px-3 py-1`}>
                            {loadingJob && <Loader2 className="h-3 w-3 animate-spin mr-1 inline" />}
                            {sb.label}
                          </Badge>
                        );
                      })()}
                      {selectedJob.status === 'done' && selectedJob.hasMergedJson && (
                        <>
                          <Button variant="outline" size="sm" className="gap-1 border-slate-300 text-slate-800" onClick={() => saveMerged().catch((e) => toast.error(parseError(e)))}>
                            <Save className="h-3.5 w-3.5" />
                            Save
                          </Button>
                          <Button variant="outline" size="sm" className="gap-1 border-slate-300 text-slate-800" onClick={() => revertMerged().catch((e) => toast.error(parseError(e)))}>
                            <RotateCcw className="h-3.5 w-3.5" />
                            Revert
                          </Button>
                          <Button size="sm" className="gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => importCurrentJob().catch((e) => toast.error(parseError(e)))}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Import
                          </Button>
                          {(selectedJob.importStatus === 'imported' || selectedJob.importStatus === 'stale') ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 border-slate-300 text-slate-800"
                              onClick={() => setJobImportFlag(selectedJob.id, false).catch((e) => toast.error(parseError(e)))}
                            >
                              <Tag className="h-3.5 w-3.5" />
                              Mark not imported
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 border-slate-300 text-slate-800"
                              onClick={() => setJobImportFlag(selectedJob.id, true).catch((e) => toast.error(parseError(e)))}
                            >
                              <Tag className="h-3.5 w-3.5" />
                              Mark imported
                            </Button>
                          )}
                        </>
                      )}
                      <Button variant="destructive" size="sm" className="gap-1" onClick={() => deleteJob().catch((e) => toast.error(parseError(e)))}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <ResizablePanelGroup
                direction="horizontal"
                className="flex-1 min-h-0 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              >
                <ResizablePanel defaultSize={35} minSize={18} maxSize={60} className="min-w-0 min-h-0 overflow-hidden">
                  <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
                    <div className="shrink-0 border-b border-slate-200/80 px-4 py-3">
                      <h3 className="text-base font-semibold text-slate-900">Original scan</h3>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
                      {selectedJob.status === 'failed' ? (
                        <div className="flex items-center gap-2 text-red-600 text-sm py-8 justify-center">
                          <AlertCircle className="h-4 w-4" />
                          {selectedJob.error || 'Extraction failed'}
                        </div>
                      ) : originalImg ? (
                        <img
                          src={originalImg}
                          alt="Original scan"
                          className="w-full rounded border border-slate-200 bg-white"
                        />
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-slate-500 py-12">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading scan…
                        </div>
                      )}
                    </div>
                  </div>
                </ResizablePanel>

                <ResizableHandle
                  withHandle
                  className="w-2 bg-slate-200 hover:bg-blue-100 transition-colors data-[panel-group-direction=horizontal]:w-2"
                />

                <ResizablePanel defaultSize={65} minSize={35} className="min-w-0 min-h-0 overflow-hidden">
                  <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
                    <div className="shrink-0 border-b border-slate-200/80 px-4 py-3">
                      <h3 className="text-base font-semibold text-slate-900">Extracted data</h3>
                      <p className="text-sm text-slate-600 mt-1">
                        Double-click cells to edit. Drag to select; drag selection to move values.
                      </p>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
                      {selectedJob.status === 'failed' ? (
                        <p className="text-sm text-slate-600 py-8 text-center">
                          No editable form — extraction failed.
                        </p>
                      ) : merged && formSpec ? (
                        <OcrSheetEditor ref={editorRef} formSpec={formSpec} merged={merged} />
                      ) : selectedJob.status === 'done' && selectedJob.hasMergedJson ? (
                        <div className="flex items-center justify-center gap-2 text-slate-500 py-12">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading form…
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-2 text-slate-500 py-12">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {stageLabel(selectedJob)}…
                        </div>
                      )}
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, Edit3, Factory, Clock, Package, CheckCircle, XCircle, Plus, Trash2, FileImage, Loader2, X } from 'lucide-react';
import type { ProductionRecord, PartProductionHistory, DowntimeEventHistory, Machine, Part, DefectReason } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { fetchOcrBlobUrl } from '@/services/ocrApi';
import {
  isOcrImportedRecord,
  matchesShiftRecord,
  ocrImportLabel,
  parseOcrJobIdFromRecord,
} from '@/utils/ocrRecordUtils';

interface ProductionRecordManagementProps {
  productionRecords: ProductionRecord[];
  partProductionHistory: PartProductionHistory[];
  downtimeEventHistory: DowntimeEventHistory[];
  machines: Machine[];
  parts: Part[];
  defectReasons: DefectReason[];
  onUpdateRecord: (id: string, updates: Partial<ProductionRecord>) => Promise<ProductionRecord>;
  onDeleteRecord: (id: string) => Promise<void>;
  onAddPartHistory: (record: Omit<PartProductionHistory, 'id' | 'timestamp'>) => void;
  onUpdatePartHistory: (id: string, updates: Partial<PartProductionHistory>) => void;
  onDeletePartHistory: (id: string) => void;
  onAddDowntimeEvent: (event: Omit<DowntimeEventHistory, 'id' | 'timestamp'>) => void;
  onUpdateDowntimeEvent: (id: string, updates: Partial<DowntimeEventHistory>) => void;
  onDeleteDowntimeEvent: (id: string) => void;
}

type PartDialogMode = 'add' | 'edit';
type DowntimeDialogMode = 'add' | 'edit';

export function ProductionRecordManagement({
  productionRecords, partProductionHistory, downtimeEventHistory,
  machines, parts, defectReasons,
  onUpdateRecord, onDeleteRecord, onAddPartHistory, onUpdatePartHistory, onDeletePartHistory,
  onAddDowntimeEvent, onUpdateDowntimeEvent, onDeleteDowntimeEvent,
}: ProductionRecordManagementProps) {
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set());

  // Delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ type: 'part' | 'downtime'; id: string } | null>(null);
  const [shiftDeleteConfirmOpen, setShiftDeleteConfirmOpen] = useState(false);

  const confirmDelete = (type: 'part' | 'downtime', id: string) => {
    setPendingDelete({ type, id });
    setDeleteConfirmOpen(true);
  };
  const executeDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === 'part') onDeletePartHistory(pendingDelete.id);
    else onDeleteDowntimeEvent(pendingDelete.id);
    setDeleteConfirmOpen(false);
    setPendingDelete(null);
  };

  // Record edit dialog
  const [editingRecord, setEditingRecord] = useState<ProductionRecord | null>(null);
  const [plannedTime, setPlannedTime] = useState(0);
  const [counterStart, setCounterStart] = useState(0);
  const [counterEnd, setCounterEnd] = useState(0);
  const [grossCount, setGrossCount] = useState(0);
  const [defectCount, setDefectCount] = useState(0);
  const [goodCount, setGoodCount] = useState(0);
  const [targetOutput, setTargetOutput] = useState(0);
  const [editNotes, setEditNotes] = useState('');

  // Part history dialog
  const [partDialogOpen, setPartDialogOpen] = useState(false);
  const [partDialogMode, setPartDialogMode] = useState<PartDialogMode>('add');
  const [partEditId, setPartEditId] = useState<string | null>(null);
  const [partCtx, setPartCtx] = useState<{ machineId: string; machineName: string; operatorName: string; date: string; shift: string }>({ machineId: '', machineName: '', operatorName: '', date: '', shift: '' });
  const [partResult, setPartResult] = useState<'PASS' | 'NOT GOOD'>('PASS');
  const [partPartId, setPartPartId] = useState('');
  const [partPartName, setPartPartName] = useState('');
  const [partDie, setPartDie] = useState('');
  const [partDefectCategory, setPartDefectCategory] = useState('');
  const [partDefectSubcategory, setPartDefectSubcategory] = useState('');
  const [partComment, setPartComment] = useState('');

  // Downtime dialog
  const [dtDialogOpen, setDtDialogOpen] = useState(false);
  const [dtDialogMode, setDtDialogMode] = useState<DowntimeDialogMode>('add');
  const [dtEditId, setDtEditId] = useState<string | null>(null);
  const [dtCtx, setDtCtx] = useState<{ machineId: string; machineName: string; operatorName: string; date: string; shift: string }>({ machineId: '', machineName: '', operatorName: '', date: '', shift: '' });
  const [dtStartTime, setDtStartTime] = useState('');
  const [dtEndTime, setDtEndTime] = useState('');
  const [dtReasonPath, setDtReasonPath] = useState('');
  const [dtComment, setDtComment] = useState('');

  const [scanPreview, setScanPreview] = useState<{ jobId: string; label: string } | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  useEffect(() => {
    if (!scanPreview) {
      if (scanUrl?.startsWith('blob:')) URL.revokeObjectURL(scanUrl);
      setScanUrl(null);
      return;
    }
    let cancelled = false;
    setScanLoading(true);
    fetchOcrBlobUrl(`/jobs/${encodeURIComponent(scanPreview.jobId)}/original.png`)
      .then((url) => {
        if (!cancelled) setScanUrl(url);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not load original scan');
      })
      .finally(() => {
        if (!cancelled) setScanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scanPreview]);

  const openScanPreview = (record: ProductionRecord) => {
    const jobId = parseOcrJobIdFromRecord(record);
    if (!jobId) {
      toast.error('No linked OCR job found for this record');
      return;
    }
    setScanPreview({ jobId, label: ocrImportLabel(record.notes) || jobId });
  };

  const closeScanPreview = () => setScanPreview(null);

  const toggleRecord = (id: string) => {
    const next = new Set(expandedRecords);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedRecords(next);
  };

  // --- Record Edit ---
  const handleEditClick = (r: ProductionRecord) => {
    setEditingRecord(r);
    setPlannedTime(r.plannedProductionTime || 0);
    setCounterStart(r.counterStart || 0);
    setCounterEnd(r.counterEnd || 0);
    setGrossCount(r.grossCount || 0);
    setDefectCount(r.defectCount || 0);
    setGoodCount(r.goodCount || 0);
    setTargetOutput(r.targetOutput || 0);
    setEditNotes(r.notes || '');
  };
  const handleAutoGoodCount = () => {
    setGoodCount(Math.max(0, grossCount - defectCount));
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    await onUpdateRecord(editingRecord.id, {
      plannedProductionTime: plannedTime,
      counterStart,
      counterEnd,
      grossCount,
      defectCount,
      goodCount,
      targetOutput,
      notes: editNotes,
    });
    setEditingRecord(null);
  };

  const relatedPartCount = editingRecord
    ? partProductionHistory.filter(p => matchesShiftRecord(editingRecord, p)).length
    : 0;
  const relatedDowntimeCount = editingRecord
    ? downtimeEventHistory.filter(d => matchesShiftRecord(editingRecord, d)).length
    : 0;

  const handleDeleteShiftRecord = async () => {
    if (!editingRecord) return;
    await onDeleteRecord(editingRecord.id);
    setShiftDeleteConfirmOpen(false);
    setEditingRecord(null);
  };

  // --- Part History CRUD ---
  const openAddPart = (record: ProductionRecord) => {
    setPartDialogMode('add');
    setPartEditId(null);
    setPartCtx({ machineId: record.machineId, machineName: record.machineName, operatorName: record.operatorName, date: record.date, shift: record.shift });
    setPartResult('PASS');
    setPartPartId('');
    setPartPartName('');
    setPartDie('');
    setPartDefectCategory('');
    setPartDefectSubcategory('');
    setPartComment('');
    setPartDialogOpen(true);
  };
  const openEditPart = (part: PartProductionHistory) => {
    setPartDialogMode('edit');
    setPartEditId(part.id);
    setPartCtx({ machineId: part.machineId, machineName: part.machineName, operatorName: part.operatorName, date: part.date, shift: part.shift });
    setPartResult(part.result);
    setPartPartId(part.partId || '');
    setPartPartName(part.partName);
    setPartDie(part.die || '');
    setPartDefectCategory(part.defectCategory || '');
    setPartDefectSubcategory(part.defectSubcategory || '');
    setPartComment(part.comment || '');
    setPartDialogOpen(true);
  };
  const handleSavePart = () => {
    const payload = {
      machineId: partCtx.machineId,
      machineName: partCtx.machineName,
      partId: partPartId,
      partName: partPartName || parts.find(p => String(p.id) === partPartId)?.name || '',
      die: partDie,
      operatorName: partCtx.operatorName,
      date: partCtx.date,
      shift: partCtx.shift as 'morning' | 'afternoon' | 'night',
      result: partResult,
      defectCategory: partResult === 'NOT GOOD' ? partDefectCategory : undefined,
      defectSubcategory: partResult === 'NOT GOOD' ? partDefectSubcategory : undefined,
      comment: partComment || undefined,
    };
    if (partDialogMode === 'add') {
      onAddPartHistory(payload);
      toast.success('Part history added');
    } else if (partEditId) {
      onUpdatePartHistory(partEditId, payload);
    }
    setPartDialogOpen(false);
  };

  // --- Downtime CRUD ---
  const calcDuration = (s: string, e: string) => {
    if (!s || !e) return 0;
    const ms = new Date(`1970-01-01T${e}`).getTime() - new Date(`1970-01-01T${s}`).getTime();
    return Math.max(0, Math.round(ms / 60000));
  };
  const openAddDowntime = (record: ProductionRecord) => {
    setDtDialogMode('add');
    setDtEditId(null);
    setDtCtx({ machineId: record.machineId, machineName: record.machineName, operatorName: record.operatorName, date: record.date, shift: record.shift });
    setDtStartTime('');
    setDtEndTime('');
    setDtReasonPath('');
    setDtComment('');
    setDtDialogOpen(true);
  };
  const openEditDowntime = (ev: DowntimeEventHistory) => {
    setDtDialogMode('edit');
    setDtEditId(ev.id);
    setDtCtx({ machineId: ev.machineId, machineName: ev.machineName, operatorName: ev.operatorName, date: ev.date, shift: ev.shift });
    setDtStartTime(ev.startTime);
    setDtEndTime(ev.endTime);
    setDtReasonPath(ev.reason?.fullPath || '');
    setDtComment(ev.comment || '');
    setDtDialogOpen(true);
  };
  const handleSaveDowntime = () => {
    const duration = calcDuration(dtStartTime, dtEndTime);
    if (duration <= 0) { toast.error('End time must be after start time'); return; }
    if (!dtReasonPath) { toast.error('Please enter a reason'); return; }
    const payload = {
      machineId: dtCtx.machineId,
      machineName: dtCtx.machineName,
      operatorName: dtCtx.operatorName,
      date: dtCtx.date,
      shift: dtCtx.shift as 'morning' | 'afternoon' | 'night',
      startTime: dtStartTime,
      endTime: dtEndTime,
      duration,
      reason: { category: dtReasonPath, fullPath: dtReasonPath },
      comment: dtComment || undefined,
    };
    if (dtDialogMode === 'add') {
      onAddDowntimeEvent(payload);
      toast.success('Downtime event added');
    } else if (dtEditId) {
      onUpdateDowntimeEvent(dtEditId, payload);
    }
    setDtDialogOpen(false);
  };

  const shiftColor: Record<string, string> = { morning: 'bg-blue-100 text-blue-800', afternoon: 'bg-amber-100 text-amber-800', night: 'bg-indigo-100 text-indigo-800' };

  // Unique defect categories / subcategories for selectors
  const defectCategories = [...new Set(defectReasons.map(r => r.category))];
  const defectSubcategories = defectReasons.filter(r => r.category === partDefectCategory).map(r => r.subcategory);

  const recordsList = (
    <div className="space-y-4">
      {productionRecords.length === 0 ? (
        <div className="text-center py-12 bg-white border border-dashed rounded-lg"><p className="text-slate-500">No shift records found.</p></div>
      ) : productionRecords.map(record => {
        const isExpanded = expandedRecords.has(record.id);
        const shiftParts = partProductionHistory.filter(p => matchesShiftRecord(record, p));
        const shiftDowntimes = downtimeEventHistory.filter(d => matchesShiftRecord(record, d));
        const ocrImported = isOcrImportedRecord(record.notes) || !!record.ocrJobId;
        const ocrJobId = parseOcrJobIdFromRecord(record);

        return (
          <Card key={record.id} className="overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="bg-slate-50 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="ghost" size="sm" onClick={() => toggleRecord(record.id)} className="h-8 w-8 p-0">
                    {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Factory className="h-5 w-5 text-blue-600" />
                    <div>
                      <h3 className="font-bold text-lg text-slate-900">{record.machineName}</h3>
                      <div className="text-sm text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>{record.date ? format(parseISO(record.date), 'MMM dd, yyyy') : '-'}</span>
                        <span>•</span>
                        <Badge variant="outline" className={shiftColor[record.shift]}>{record.shift}</Badge>
                        <span>•</span>
                        <span className="font-semibold">{record.operatorName}</span>
                        {ocrImported && (
                          <Badge className="bg-violet-600 text-white hover:bg-violet-600">OCR Imported</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm flex-wrap justify-end">
                  <div className="text-center"><div className="text-slate-500">Counter</div><div className="font-bold text-lg text-slate-900">{record.grossCount}</div></div>
                  <div className="text-center"><div className="text-slate-500">Net</div><div className="font-bold text-lg text-blue-600">{record.netProduction}</div></div>
                  <div className="text-center"><div className="text-slate-500">Defects</div><div className="font-bold text-lg text-red-600">{record.defectCount}</div></div>
                  <div className="text-center"><div className="text-slate-500">Down</div><div className="font-bold text-lg text-orange-600">{record.downtime}m</div></div>
                  {ocrImported && ocrJobId && (
                    <Button
                      variant="outline"
                      size="sm"
                      className={`gap-2 border-violet-300 text-violet-700 hover:bg-violet-50 ${scanPreview?.jobId === ocrJobId ? 'bg-violet-50 ring-1 ring-violet-300' : ''}`}
                      onClick={() => openScanPreview(record)}
                    >
                      <FileImage className="h-4 w-4" />
                      View scan
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleEditClick(record)} className="gap-2 border-slate-300"><Edit3 className="h-4 w-4" />Edit</Button>
                </div>
              </div>
              {record.notes && (
                <div className={`mt-4 p-3 rounded-md text-sm border ${ocrImported ? 'bg-violet-50 border-violet-200 text-violet-900' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
                  <strong>{ocrImported ? 'OCR Import:' : 'Shift Notes:'}</strong> {record.notes}
                </div>
              )}
            </CardHeader>

            {isExpanded && (
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                    {/* Part History */}
                    <div className="p-6 bg-white">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2"><Package className="h-5 w-5 text-slate-400" /><h4 className="font-semibold text-lg">Part History ({shiftParts.length})</h4></div>
                        <Button size="sm" variant="outline" onClick={() => openAddPart(record)} className="gap-1"><Plus className="h-3 w-3" />Add</Button>
                      </div>
                      {shiftParts.length === 0 ? (
                        <div className="text-sm text-slate-500 italic">No parts recorded.</div>
                      ) : (
                        <div className="border rounded-md overflow-hidden max-h-[300px] overflow-y-auto">
                          <Table>
                            <TableHeader className="bg-slate-50 sticky top-0">
                              <TableRow>
                                <TableHead>Time</TableHead><TableHead>Part</TableHead><TableHead>Result</TableHead><TableHead>Defect</TableHead><TableHead className="w-[80px]">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {shiftParts.map(part => (
                                <TableRow key={part.id}>
                                  <TableCell className="text-xs">{part.timestamp ? format(new Date(part.timestamp), 'HH:mm:ss') : '-'}</TableCell>
                                  <TableCell className="text-sm">{part.partName} {part.die ? `(${part.die})` : ''}</TableCell>
                                  <TableCell>
                                    {part.result === 'PASS' ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-green-200"><CheckCircle className="w-3 h-3 mr-1" />PASS</Badge> : <Badge className="bg-red-100 text-red-800 hover:bg-red-100 border-red-200"><XCircle className="w-3 h-3 mr-1" />NG</Badge>}
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-600">{part.result === 'NOT GOOD' && part.defectCategory ? `${part.defectCategory} → ${part.defectSubcategory}` : '-'}</TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditPart(part)}><Edit3 className="h-3 w-3" /></Button>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => confirmDelete('part', part.id)}><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>

                    {/* Downtime Events */}
                    <div className="bg-white p-6 bg-slate-50">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2"><Clock className="h-5 w-5 text-slate-400" /><h4 className="font-semibold text-lg">Downtime Events ({shiftDowntimes.length})</h4></div>
                        <Button size="sm" variant="outline" onClick={() => openAddDowntime(record)} className="gap-1"><Plus className="h-3 w-3" />Add</Button>
                      </div>
                      {shiftDowntimes.length === 0 ? (
                        <div className="text-sm text-slate-500 italic">No downtime recorded.</div>
                      ) : (
                        <div className="border rounded-md overflow-hidden bg-white max-h-[300px] overflow-y-auto">
                          <Table>
                            <TableHeader className="bg-slate-50 sticky top-0">
                              <TableRow>
                                <TableHead>Time</TableHead><TableHead>Duration</TableHead><TableHead>Reason</TableHead><TableHead className="w-[80px]">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {shiftDowntimes.map(event => (
                                <TableRow key={event.id}>
                                  <TableCell className="text-xs">{event.startTime} - {event.endTime}</TableCell>
                                  <TableCell><Badge variant="outline" className="bg-orange-50 text-orange-800 border-orange-200">{event.duration}m</Badge></TableCell>
                                  <TableCell className="text-xs text-slate-600 max-w-[200px] truncate" title={event.reason?.fullPath}>{event.reason?.fullPath || '-'}</TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDowntime(event)}><Edit3 className="h-3 w-3" /></Button>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => confirmDelete('downtime', event.id)}><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
    </div>
  );

  const editingOcrJobId = editingRecord ? parseOcrJobIdFromRecord(editingRecord) : null;

  return (
    <div className="space-y-6 w-full">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Shift Records</h2>
        <p className="text-slate-600">View and manage full shift production records.</p>
      </div>

      <div className="flex flex-col lg:flex-row items-start gap-4">
        <div className="flex-1 min-w-0">{recordsList}</div>

        {scanPreview && (
          <aside className="sticky top-4 z-10 flex w-full max-w-md shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:w-[min(42vw,520px)] self-start max-h-[calc(100vh-6rem)]">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 shrink-0 bg-white">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-900 truncate">Original scan</h3>
                <p className="text-xs text-slate-500 truncate">{scanPreview.label}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={closeScanPreview} className="shrink-0">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
              {scanLoading ? (
                <div className="flex items-center justify-center gap-2 text-slate-500 py-16">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading scan…
                </div>
              ) : scanUrl ? (
                <img src={scanUrl} alt="OCR original scan" className="w-full rounded border border-slate-200 bg-white" />
              ) : (
                <p className="text-sm text-slate-500 text-center py-16">Scan not available</p>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* === Record Edit Dialog === */}
      <Dialog open={!!editingRecord} onOpenChange={open => !open && setEditingRecord(null)}>
        <DialogContent className="sm:max-w-[500px] bg-white">
          <DialogHeader>
            <DialogTitle>Edit Shift Record</DialogTitle>
            <DialogDescription>Modify shift-level summary metrics.</DialogDescription>
            {editingRecord && (isOcrImportedRecord(editingRecord.notes) || !!editingRecord.ocrJobId) && (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <Badge className="bg-violet-600 text-white hover:bg-violet-600">OCR Imported</Badge>
                {editingOcrJobId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 border-violet-300 text-violet-700"
                    onClick={() => {
                      openScanPreview(editingRecord);
                      setEditingRecord(null);
                    }}
                  >
                    <FileImage className="h-3.5 w-3.5" />
                    View original scan
                  </Button>
                )}
              </div>
            )}
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Planned Time (min)</Label><Input type="number" value={plannedTime} onChange={e => setPlannedTime(Number(e.target.value))} /></div>
              <div className="grid gap-2"><Label>Target Output</Label><Input type="number" value={targetOutput} onChange={e => setTargetOutput(Number(e.target.value))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Counter Start</Label><Input type="number" value={counterStart} onChange={e => setCounterStart(Number(e.target.value))} /></div>
              <div className="grid gap-2"><Label>Counter End</Label><Input type="number" value={counterEnd} onChange={e => setCounterEnd(Number(e.target.value))} /></div>
            </div>
            <div className="grid gap-2"><Label>Gross Count</Label><Input type="number" value={grossCount} onChange={e => setGrossCount(Number(e.target.value))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>NG Parts</Label><Input type="number" value={defectCount} onChange={e => setDefectCount(Number(e.target.value))} /></div>
              <div className="grid gap-2">
                <Label>Good Parts</Label>
                <div className="flex gap-2">
                  <Input type="number" value={goodCount} onChange={e => setGoodCount(Number(e.target.value))} />
                  <Button type="button" variant="outline" onClick={handleAutoGoodCount} className="shrink-0">
                    Auto
                  </Button>
                </div>
                <p className="text-xs text-slate-500">Auto sets good parts to gross count − NG parts.</p>
              </div>
            </div>
            <div className="grid gap-2"><Label>Shift Notes</Label><Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} /></div>
          </div>
          <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-3">
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setShiftDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Shift Record
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingRecord(null)}>Cancel</Button>
              <Button variant="outline" onClick={handleSaveEdit}>Save Changes</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Part History Dialog === */}
      <Dialog open={partDialogOpen} onOpenChange={setPartDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white">
          <DialogHeader><DialogTitle>{partDialogMode === 'add' ? 'Add Part Entry' : 'Edit Part Entry'}</DialogTitle><DialogDescription>Record a part inspection result for this shift.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Part</Label>
              <Select value={partPartId} onValueChange={v => { setPartPartId(v); setPartPartName(parts.find(p => String(p.id) === v)?.name || ''); }}>
                <SelectTrigger><SelectValue placeholder="Select part" /></SelectTrigger>
                <SelectContent>{parts.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2"><Label>Die</Label><Input value={partDie} onChange={e => setPartDie(e.target.value)} placeholder="e.g. Die #1" /></div>
            <div className="grid gap-2">
              <Label>Result</Label>
              <Select value={partResult} onValueChange={v => setPartResult(v as 'PASS' | 'NOT GOOD')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PASS">PASS</SelectItem>
                  <SelectItem value="NOT GOOD">NOT GOOD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {partResult === 'NOT GOOD' && (
              <>
                <div className="grid gap-2">
                  <Label>Defect Category</Label>
                  <Select value={partDefectCategory} onValueChange={setPartDefectCategory}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{defectCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {partDefectCategory && (
                  <div className="grid gap-2">
                    <Label>Defect Subcategory</Label>
                    <Select value={partDefectSubcategory} onValueChange={setPartDefectSubcategory}>
                      <SelectTrigger><SelectValue placeholder="Select subcategory" /></SelectTrigger>
                      <SelectContent>{[...new Set(defectSubcategories)].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
            <div className="grid gap-2"><Label>Comment</Label><Input value={partComment} onChange={e => setPartComment(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSavePart}>{partDialogMode === 'add' ? 'Add' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Downtime Event Dialog === */}
      <Dialog open={dtDialogOpen} onOpenChange={setDtDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-white">
          <DialogHeader><DialogTitle>{dtDialogMode === 'add' ? 'Add Downtime Event' : 'Edit Downtime Event'}</DialogTitle><DialogDescription>Record a downtime event for this shift.</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Start Time</Label><Input type="time" value={dtStartTime} onChange={e => setDtStartTime(e.target.value)} /></div>
              <div className="grid gap-2"><Label>End Time</Label><Input type="time" value={dtEndTime} onChange={e => setDtEndTime(e.target.value)} /></div>
            </div>
            {dtStartTime && dtEndTime && (
              <div className="text-sm text-slate-600">Duration: <strong>{calcDuration(dtStartTime, dtEndTime)} minutes</strong></div>
            )}
            <div className="grid gap-2"><Label>Reason</Label><Input value={dtReasonPath} onChange={e => setDtReasonPath(e.target.value)} placeholder="e.g. Mechanical > Hydraulic > Leak" /></div>
            <div className="grid gap-2"><Label>Comment</Label><Input value={dtComment} onChange={e => setDtComment(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDtDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveDowntime}>{dtDialogMode === 'add' ? 'Add' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Delete Shift Record Confirmation === */}
      <AlertDialog open={shiftDeleteConfirmOpen} onOpenChange={setShiftDeleteConfirmOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entire shift record?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This will permanently delete the shift record for{' '}
                  <strong>{editingRecord?.machineName}</strong> on{' '}
                  <strong>{editingRecord?.date ? format(parseISO(editingRecord.date), 'MMM dd, yyyy') : '-'}</strong>{' '}
                  ({editingRecord?.shift} shift, {editingRecord?.operatorName}).
                </p>
                <p>Also deleted:</p>
                <ul className="list-disc pl-5">
                  <li>{relatedPartCount} part history {relatedPartCount === 1 ? 'entry' : 'entries'}</li>
                  <li>{relatedDowntimeCount} downtime {relatedDowntimeCount === 1 ? 'event' : 'events'}</li>
                </ul>
                <p className="font-semibold text-red-600">This action cannot be undone.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteShiftRecord} className="bg-red-600 hover:bg-red-700 text-white">
              Delete Shift Record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* === Delete Part/Downtime Confirmation === */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {pendingDelete?.type === 'part' ? 'part history entry' : 'downtime event'}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-red-600 hover:bg-red-700 text-white">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

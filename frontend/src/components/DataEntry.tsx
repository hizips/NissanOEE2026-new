import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Users,
  Factory,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  RefreshCw,
  LogOut,
  Trash2,
  AlertCircle,
  Plus,
  Save,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { Machine, ProductionRecord, PartProductionHistory, DowntimeEventHistory, DefectReason, Part } from '@/types';
import type { OperatorSetupData } from '@/components/OperatorSetup';
import { DefectCategorySelector } from '@/components/DefectCategorySelector';
import { DowntimeReasonSelector, type DowntimeReasonPath } from '@/components/DowntimeReasonSelector';

const DIES = ['Die #1', 'Die #2', 'Die #3', 'Die #4', 'Die #5', 'Die #6', 'Die #7', 'Die #8'];

interface DataEntryProps {
  machines: Machine[];
  parts: Part[];
  onAddRecord: (record: Omit<ProductionRecord, 'id' | 'timestamp'>) => Promise<ProductionRecord>;
  onUpdateRecord?: (id: string, updates: Partial<ProductionRecord>) => Promise<ProductionRecord>;
  onAddPartHistory: (record: Omit<PartProductionHistory, 'id' | 'timestamp'>) => Promise<void> | void;
  onAddDowntimeEvent: (event: Omit<DowntimeEventHistory, 'id' | 'timestamp'>) => Promise<void> | void;
  onUpdatePartHistory: (id: string, updates: Partial<PartProductionHistory>) => Promise<void> | void;
  currentUser: { employeeId: string; role: 'operator' | 'manager' } | null;
  loginTimestamp: Date;
  operatorSetup?: OperatorSetupData;
  onEditSetup?: () => void;
  defectReasons: DefectReason[];
  onCheckOff?: () => void;
}

interface ProductRecord {
  id: string;
  status: 'good' | 'ng';
  defectCategory?: string;
  defectSubcategory?: string;
  comment?: string;
  timestamp: Date;
  partName: string;
  die: string;
  machineName: string;
  operatorName: string;
  shift: string;
}

interface DowntimeEvent {
  id: string;
  startTime: string;
  endTime: string;
  duration: number;
  reason: DowntimeReasonPath;
  comment?: string;
  timestamp: Date;
  partName: string;
  die: string;
  machineName: string;
  operatorName: string;
  shift: string;
}

export function DataEntry({
  machines,
  parts,
  onAddRecord,
  onUpdateRecord,
  onAddPartHistory,
  onAddDowntimeEvent,
  onUpdatePartHistory, // Keep this
  currentUser,
  loginTimestamp,
  operatorSetup,
  onEditSetup,
  onCheckOff,
  defectReasons,
}: DataEntryProps) {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [showDefectSelector, setShowDefectSelector] = useState(false);
  const [currentDefect, setCurrentDefect] = useState<{
    category: string;
    subcategory: string;
    specificReason?: string; // Add this
    comment?: string;
  } | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productToEdit, setProductToEdit] = useState<ProductRecord | null>(null);
  const [productToDelete, setProductToDelete] = useState<ProductRecord | null>(null);

  // Downtime state
  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([]);
  const [showDowntimeRecorder, setShowDowntimeRecorder] = useState(false);
  const [downtimeSummaryExpanded, setDowntimeSummaryExpanded] = useState(false);
  const [currentDowntime, setCurrentDowntime] = useState<{
    startTime: string;
    endTime: string;
    reason: DowntimeReasonPath | null;
    comment?: string;
  }>({
    startTime: '',
    endTime: '',
    reason: null,
    comment: '',
  });
  const [editingDowntimeId, setEditingDowntimeId] = useState<string | null>(null);
  const [startTimeHighlight, setStartTimeHighlight] = useState(false);
  const [endTimeHighlight, setEndTimeHighlight] = useState(false);
  const [dieChanged, setDieChanged] = useState(false);

  // Shift comment state
  const [shiftComment, setShiftComment] = useState('');
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);

  // Checkoff dialog state
  const [checkoffDialogOpen, setCheckoffDialogOpen] = useState(false);
  const [counterEndInput, setCounterEndInput] = useState('');

  const syncProductionRecord = async (
    currentProducts: ProductRecord[] = products,
    currentDowntimes: DowntimeEvent[] = downtimeEvents,
    currentComment: string = shiftComment
  ) => {
    if (!operatorSetup) return;

    const goodCount = currentProducts.filter(p => p.status === 'good').length;
    const defectCount = currentProducts.filter(p => p.status === 'ng').length;
    const netProduction = currentProducts.length;
    const totalDowntime = currentDowntimes.reduce((total, event) => total + event.duration, 0);

    // Auto-detect shift
    const hour = new Date().getHours();
    let detectedShift: 'morning' | 'afternoon' | 'night' = 'morning';
    if (hour >= 6 && hour < 14) detectedShift = 'morning';
    else if (hour >= 14 && hour < 22) detectedShift = 'afternoon';
    else detectedShift = 'night';

    const payload: Omit<ProductionRecord, 'id' | 'timestamp'> = {
      machineId: operatorSetup.machineId,
      machineName: operatorSetup.machineName,
      date: format(new Date(), 'yyyy-MM-dd'),
      shift: detectedShift,
      plannedProductionTime: 480,
      counterStart: operatorSetup.counterStart || 0,
      counterEnd: 0, // Will be set at checkoff
      grossCount: 0, // Will be set at checkoff
      excludedShots: 0,
      netProduction: netProduction,
      totalCount: netProduction,
      targetOutput: 0,
      performance: 0,
      downtime: totalDowntime,
      goodCount: goodCount,
      defectCount: defectCount,
      operatorName: operatorSetup.operatorName,
      notes: currentComment,
    };

    if (activeRecordId && onUpdateRecord) {
      await onUpdateRecord(activeRecordId, payload);
    } else {
      const created = await onAddRecord(payload);
      if (created && created.id) {
        setActiveRecordId(created.id);
      }
    }
  };

  // Auto-save interval
  useEffect(() => {
    const interval = setInterval(() => {
      syncProductionRecord(products, downtimeEvents, shiftComment);
    }, 60000); // every 1 minute
    return () => clearInterval(interval);
  }, [products, downtimeEvents, shiftComment, operatorSetup, activeRecordId]);


  // Current time display for downtime recorder
  const [currentTime, setCurrentTime] = useState(new Date());

  // Current die tracking (can change during shift via downtime event)
  const [currentDie, setCurrentDie] = useState<string>(operatorSetup?.die || '');
  const [newDieSelection, setNewDieSelection] = useState<string>('');

  // Ref for auto-scroll to inspection section
  const inspectionSectionRef = useRef<HTMLDivElement>(null);
  const [inspectionHighlight, setInspectionHighlight] = useState(false);

  // Auto-scroll to inspection section
  const scrollToInspection = () => {
    // Force scroll to absolute top first (instant, not smooth)
    window.scrollTo(0, 0);

    // Then smoothly scroll to inspection section after a brief delay
    setTimeout(() => {
      inspectionSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    }, 10);

    // Add brief highlight effect
    setInspectionHighlight(true);
    setTimeout(() => setInspectionHighlight(false), 2500);
  };

  useEffect(() => {
    if (operatorSetup?.die) {
      setCurrentDie(operatorSetup.die);
    }
  }, [operatorSetup?.die]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Ensure page loads at top with inspection section visible
  useEffect(() => {
    if (operatorSetup) {
      // Immediately scroll to top when entering Data Entry page
      window.scrollTo(0, 0);
      // Ensure inspection section is at the top
      setTimeout(() => {
        inspectionSectionRef.current?.scrollIntoView({
          behavior: 'auto',
          block: 'start'
        });
      }, 50);
    }
  }, [operatorSetup]);

  // Scroll to top on initial component mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Reset die change toggle when reason changes and no longer includes "die"
  useEffect(() => {
    if (currentDowntime.reason) {
      const hasDie = currentDowntime.reason.fullPath.toLowerCase().includes('die');
      if (!hasDie) {
        setDieChanged(false);
        setNewDieSelection('');
      }
    }
  }, [currentDowntime.reason]);

  // Dies available for the currently selected part (from operator setup)
  const availableDies = operatorSetup?.partId
    ? (parts.find(p => p.id === operatorSetup.partId)?.dies || [])
    : [];

  const goodCount = products.filter(p => p.status === 'good').length;
  const ngCount = products.filter(p => p.status === 'ng').length;
  const totalCount = products.length;
  const totalDowntimeEvents = downtimeEvents.length;
  const totalDowntimeDuration = downtimeEvents.reduce((sum, event) => sum + event.duration, 0);

  const getCurrentShift = (): 'morning' | 'afternoon' | 'night' => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return 'morning';
    if (hour >= 14 && hour < 22) return 'afternoon';
    return 'night';
  };



  const handleGoodClick = async () => {
    if (!operatorSetup) {
      toast.error('Please complete operator setup first');
      return;
    }

    const newProduct: ProductRecord = {
      id: crypto.randomUUID(),
      status: 'good',
      timestamp: new Date(),
      partName: operatorSetup.partName,
      die: currentDie, // Use current die (may have changed during shift)
      machineName: operatorSetup.machineName,
      operatorName: operatorSetup.operatorName,
      shift: getCurrentShift(),
    };

    const newProducts = [newProduct, ...products];
    setProducts(newProducts);
    await syncProductionRecord(newProducts);

    // Save to part production history
    await onAddPartHistory({
      machineId: operatorSetup.machineId,
      machineName: operatorSetup.machineName,
      partId: operatorSetup.partId,
      partName: operatorSetup.partName,
      die: currentDie,
      operatorName: operatorSetup.operatorName,
      date: format(new Date(), 'yyyy-MM-dd'),
      shift: getCurrentShift(),
      result: 'PASS',
    });

    toast.success('PASS part recorded');
  };

  const handleNGClick = () => {
    if (!operatorSetup) {
      toast.error('Please complete operator setup first');
      return;
    }
    setShowDefectSelector(true);
    setCurrentDefect(null);
  };

  const handleDefectSave = async () => {
    if (!currentDefect || !operatorSetup) {
      toast.error('Please select a defect reason');
      return;
    }

    if (editingProductId) {
      // Edit existing product
      const newProducts: ProductRecord[] = products.map(p =>
        p.id === editingProductId
          ? {
            ...p,
            status: 'ng' as const,
            defectCategory: currentDefect.category,
            defectSubcategory: currentDefect.subcategory,
            comment: currentDefect.comment,
          }
          : p
      );
      setProducts(newProducts);
      await syncProductionRecord(newProducts);
      toast.success('Product updated');
      setEditingProductId(null);
    } else {
      // Add new NOT GOOD product
      const newProduct: ProductRecord = {
        id: crypto.randomUUID(),
        status: 'ng',
        defectCategory: currentDefect.category,
        defectSubcategory: currentDefect.subcategory,
        comment: currentDefect.comment,
        timestamp: new Date(),
        partName: operatorSetup.partName,
        die: currentDie, // Use current die (may have changed during shift)
        machineName: operatorSetup.machineName,
        operatorName: operatorSetup.operatorName,
        shift: getCurrentShift(),
      };

      const newProducts = [newProduct, ...products];
      setProducts(newProducts);
      await syncProductionRecord(newProducts);

      // Save to part production history
      await onAddPartHistory({
        machineId: operatorSetup.machineId,
        machineName: operatorSetup.machineName,
        partId: operatorSetup.partId,
        partName: operatorSetup.partName,
        die: currentDie,
        operatorName: operatorSetup.operatorName,
        date: format(new Date(), 'yyyy-MM-dd'),
        shift: getCurrentShift(),
        result: 'NOT GOOD',
        defectCategory: currentDefect.category,
        defectSubcategory: currentDefect.subcategory,
        comment: currentDefect.comment,
      });

      toast.success('NOT GOOD part recorded with defect reason');
    }

    // Auto-collapse summaries first
    setSummaryExpanded(false);
    setDowntimeSummaryExpanded(false);

    // Close defect selector
    setShowDefectSelector(false);
    setCurrentDefect(null);

    // Return to inspection section after UI updates
    setTimeout(() => {
      scrollToInspection();
      // Add visual feedback
      toast.info('Ready for next part inspection');
    }, 300);
  };

  const confirmDeleteProduct = () => {
    if (!productToDelete) return;
    const newProducts = products.filter(p => p.id !== productToDelete.id);
    setProducts(newProducts);
    syncProductionRecord(newProducts);
    setProductToDelete(null);
    toast.success('Product deleted');
  };

  const handleEditProduct = (product: ProductRecord) => {
    setProductToEdit(product);
  };

  const saveProductEdit = () => {
    if (!productToEdit) return;

    if (productToEdit.status === 'ng' && (!productToEdit.defectCategory || !productToEdit.defectSubcategory)) {
      toast.error('Please select a defect reason');
      return;
    }

    const newProducts = products.map(p =>
      p.id === productToEdit.id ? productToEdit : p
    );

    setProducts(newProducts);
    syncProductionRecord(newProducts);
    setProductToEdit(null);
    toast.success('Product updated');
  };

  // Downtime handlers
  const handleAddDowntime = () => {
    setShowDowntimeRecorder(true);
    setCurrentDowntime({
      startTime: '',
      endTime: '',
      reason: null,
      comment: '',
    });
    setEditingDowntimeId(null);
    setDieChanged(false);
    setNewDieSelection('');
  };

  const calculateDowntimeDuration = (start: string, end: string): number => {
    if (!start || !end) return 0;
    const startDate = new Date(`1970-01-01T${start}`);
    const endDate = new Date(`1970-01-01T${end}`);
    const durationMs = endDate.getTime() - startDate.getTime();
    return Math.max(0, Math.round(durationMs / 60000));
  };

  const handleSaveDowntime = async () => {
    if (!operatorSetup) {
      toast.error('Please complete operator setup first');
      return;
    }

    if (!currentDowntime.startTime || !currentDowntime.endTime) {
      toast.error('Please enter start and end times');
      return;
    }

    if (!currentDowntime.reason) {
      toast.error('Please select a downtime reason');
      return;
    }

    const duration = calculateDowntimeDuration(currentDowntime.startTime, currentDowntime.endTime);

    if (duration <= 0) {
      toast.error('End time must be after start time');
      return;
    }

    // Check if this is a die change downtime event
    const isDieChange = currentDowntime.reason.fullPath.toLowerCase().includes('die change');

    // Check if operator marked die as changed for any die-related issue
    const shouldChangeDie = isDieChange || dieChanged;

    if (shouldChangeDie && !editingDowntimeId) {
      if (!newDieSelection) {
        toast.error('Please select the new die number');
        return;
      }
    }

    if (editingDowntimeId) {
      // Update existing downtime event
      const newDowntimes = downtimeEvents.map(event =>
        event.id === editingDowntimeId
          ? {
            ...event,
            startTime: currentDowntime.startTime,
            endTime: currentDowntime.endTime,
            duration,
            reason: currentDowntime.reason!,
            comment: currentDowntime.comment,
          }
          : event
      );
      setDowntimeEvents(newDowntimes);
      syncProductionRecord(products, newDowntimes);
      toast.success('Downtime event updated');
      setEditingDowntimeId(null);
    } else {
      // Add new downtime event
      const newEvent: DowntimeEvent = {
        id: crypto.randomUUID(),
        startTime: currentDowntime.startTime,
        endTime: currentDowntime.endTime,
        duration,
        reason: currentDowntime.reason,
        comment: currentDowntime.comment,
        timestamp: new Date(),
        partName: operatorSetup.partName,
        die: currentDie, // Use current die before change
        machineName: operatorSetup.machineName,
        operatorName: operatorSetup.operatorName,
        shift: getCurrentShift(),
      };

      const newDowntimes = [newEvent, ...downtimeEvents];
      setDowntimeEvents(newDowntimes);
      await syncProductionRecord(products, newDowntimes);

      // Save to downtime event history
      await onAddDowntimeEvent({
        machineId: operatorSetup.machineId,
        machineName: operatorSetup.machineName,
        operatorName: operatorSetup.operatorName,
        date: format(new Date(), 'yyyy-MM-dd'),
        shift: getCurrentShift(),
        startTime: currentDowntime.startTime,
        endTime: currentDowntime.endTime,
        duration,
        reason: currentDowntime.reason,
        comment: currentDowntime.comment,
      });

      // If this is a die change, update current die for all future parts
      if (shouldChangeDie && newDieSelection) {
        const oldDie = currentDie;
        setCurrentDie(newDieSelection);
        const timeString = format(new Date(), 'HH:mm');
        const appendText = `**DIE CHANGE from ${oldDie} to ${newDieSelection} at ${timeString}**`;
        setShiftComment(prev => prev ? `${prev}\n${appendText}` : appendText);
        toast.warning(`Die changed: ${oldDie} → ${newDieSelection}`);
      } else {
        toast.success('Downtime event recorded');
      }
    }

    // Auto-collapse summaries first
    setSummaryExpanded(false);
    setDowntimeSummaryExpanded(false);

    // Close downtime recorder
    setShowDowntimeRecorder(false);
    setCurrentDowntime({
      startTime: '',
      endTime: '',
      reason: null,
      comment: '',
    });
    setNewDieSelection('');
    setDieChanged(false);

    // Return to inspection section after UI updates
    setTimeout(() => {
      scrollToInspection();
      // Add visual feedback
      toast.info('Ready for next part inspection');
    }, 300);
  };

  const handleEditDowntime = (event: DowntimeEvent) => {
    setEditingDowntimeId(event.id);
    setCurrentDowntime({
      startTime: event.startTime,
      endTime: event.endTime,
      reason: event.reason,
      comment: event.comment,
    });
    setShowDowntimeRecorder(true);
  };

  const handleDeleteDowntime = (id: string) => {
    const newDowntimes = downtimeEvents.filter(e => e.id !== id);
    setDowntimeEvents(newDowntimes);
    syncProductionRecord(products, newDowntimes);
    toast.success('Downtime event deleted');
  };

  const handleCancelDowntime = () => {
    // Auto-collapse summaries first
    setSummaryExpanded(false);
    setDowntimeSummaryExpanded(false);

    // Close downtime recorder
    setShowDowntimeRecorder(false);
    setCurrentDowntime({
      startTime: '',
      endTime: '',
      reason: null,
      comment: '',
    });
    setEditingDowntimeId(null);
    setDieChanged(false);
    setNewDieSelection('');

    // Return to inspection section after UI updates
    setTimeout(() => {
      scrollToInspection();
    }, 300);
  };

  const handleSaveShiftComment = () => {
    syncProductionRecord(products, downtimeEvents, shiftComment);
    toast.success('Shift comment saved');

    // Auto-collapse summaries first
    setSummaryExpanded(false);
    setDowntimeSummaryExpanded(false);

    // Return to inspection section after UI updates
    setTimeout(() => {
      scrollToInspection();
      // Add visual feedback
      toast.info('Ready for next part inspection');
    }, 300);
  };

  const getCurrentTimeString = (): string => {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const handleUseCurrentTimeStart = () => {
    const currentTime = getCurrentTimeString();
    setCurrentDowntime({ ...currentDowntime, startTime: currentTime });
    setStartTimeHighlight(true);
    setTimeout(() => setStartTimeHighlight(false), 1000);
    toast.success(`Start time set to ${currentTime}`);
  };

  const handleUseCurrentTimeEnd = () => {
    const currentTime = getCurrentTimeString();
    setCurrentDowntime({ ...currentDowntime, endTime: currentTime });
    setEndTimeHighlight(true);
    setTimeout(() => setEndTimeHighlight(false), 1000);
    toast.success(`End time set to ${currentTime}`);
  };

  const handleCheckOffWrapper = async () => {
    // Show the counter end dialog instead of immediately checking off
    setCheckoffDialogOpen(true);
    setCounterEndInput('');
  };

  const handleConfirmCheckOff = async () => {
    const counterEnd = parseInt(counterEndInput);
    if (isNaN(counterEnd) || counterEnd < 0) {
      toast.error('Please enter a valid counter end number');
      return;
    }

    const counterStart = operatorSetup?.counterStart || 0;
    const grossCount = counterEnd - counterStart;

    if (grossCount < 0) {
      toast.error('Counter end must be greater than counter start');
      return;
    }

    // Do a final sync with the counter end values
    if (operatorSetup && activeRecordId && onUpdateRecord) {
      const goodCount = products.filter(p => p.status === 'good').length;
      const defectCount = products.filter(p => p.status === 'ng').length;
      const netProduction = products.length;
      const totalDowntime = downtimeEvents.reduce((total, event) => total + event.duration, 0);

      const hour = new Date().getHours();
      let detectedShift: 'morning' | 'afternoon' | 'night' = 'morning';
      if (hour >= 6 && hour < 14) detectedShift = 'morning';
      else if (hour >= 14 && hour < 22) detectedShift = 'afternoon';
      else detectedShift = 'night';

      await onUpdateRecord(activeRecordId, {
        counterStart,
        counterEnd,
        grossCount,
        excludedShots: 0,
        netProduction,
        totalCount: netProduction,
        goodCount,
        defectCount,
        downtime: totalDowntime,
        notes: shiftComment,
        shift: detectedShift,
      });
    } else {
      // No active record yet, do a full sync first
      await syncProductionRecord();
    }

    setCheckoffDialogOpen(false);
    toast.success('Shift checked off successfully!');
    if (onCheckOff) onCheckOff();
  };

  // Find this block around line 476
  if (!operatorSetup) {
    return (
      <Card className="max-w-2xl mx-auto border-4 border-amber-500 shadow-2xl">
        <CardHeader className="bg-amber-50">
          <div className="flex items-center gap-4">
            <AlertCircle className="h-12 w-12 text-amber-600" />
            <div>
              <CardTitle className="text-2xl">Setup Required</CardTitle>
              <CardDescription className="text-lg text-amber-800">
                Please complete operator setup before starting production data entry.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <p className="text-slate-600">
            Your session may have timed out or the page was refreshed. You need to re-verify your machine and part selection to continue.
          </p>
          <div className="flex gap-4">
            {/* Add this button to allow returning to setup without logging out */}
            <Button
              onClick={onEditSetup}
              className="flex-1 h-16 text-xl bg-blue-600 hover:bg-blue-700"
            >
              <RefreshCw className="h-6 w-6 mr-2" />
              Return to Setup
            </Button>

            {/* Optional: Add logout if they want to switch operators entirely */}
            <Button
              onClick={handleCheckOffWrapper}
              variant="outline"
              className="h-16 px-8 border-2 border-slate-300"
            >
              <LogOut className="h-6 w-6 mr-2" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Sticky Top Information Bar */}
        <div className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg shadow-2xl p-6">
          <div className="flex items-center justify-between gap-6">
            {/* Left: Setup Info */}
            <div className="flex items-center gap-6 flex-1">
              <div className="flex items-center gap-3 px-4 py-3 bg-white/20 backdrop-blur-sm rounded-lg">
                <Users className="h-6 w-6" />
                <div>
                  <div className="text-xs opacity-90">Operator</div>
                  <div className="font-bold text-lg">{operatorSetup.operatorName}</div>
                </div>
              </div>
              <Separator orientation="vertical" className="h-14 bg-white/30" />
              <div className="flex items-center gap-3 px-4 py-3 bg-white/20 backdrop-blur-sm rounded-lg">
                <Factory className="h-6 w-6" />
                <div>
                  <div className="text-xs opacity-90">Machine</div>
                  <div className="font-bold text-lg">{operatorSetup.machineName}</div>
                </div>
              </div>
              <Separator orientation="vertical" className="h-14 bg-white/30" />
              <div className="flex items-center gap-3 px-4 py-3 bg-white/20 backdrop-blur-sm rounded-lg">
                <Package className="h-6 w-6" />
                <div>
                  <div className="text-xs opacity-90">Part</div>
                  <div className="font-bold text-lg">{operatorSetup.partName}</div>
                </div>
              </div>
              <Separator orientation="vertical" className="h-14 bg-white/30" />
              <div className="flex items-center gap-3 px-4 py-3 bg-white/20 backdrop-blur-sm rounded-lg">
                <Factory className="h-6 w-6" />
                <div>
                  <div className="text-xs opacity-90">Current Die</div>
                  <div className="font-bold text-lg">{currentDie || 'N/A'}</div>
                </div>
              </div>
              <Separator orientation="vertical" className="h-14 bg-white/30" />
              <div className="flex items-center gap-3 px-4 py-3 bg-white/20 backdrop-blur-sm rounded-lg">
                <Clock className="h-6 w-6" />
                <div>
                  <div className="text-xs opacity-90">Shift</div>
                  <div className="font-bold text-lg capitalize">{getCurrentShift()}</div>
                </div>
              </div>
            </div>

            {/* Right: Action Buttons (Vertical Stack) */}
            <div className="flex flex-col gap-3">
              {onEditSetup && (
                <Button
                  onClick={onEditSetup}
                  variant="outline"
                  size="lg"
                  className="h-12 px-8 bg-white/10 border-2 border-white/30 text-white hover:bg-white/20 hover:text-white whitespace-nowrap"
                >
                  <Edit3 className="h-5 w-5 mr-2" />
                  Edit Setup
                </Button>
              )}
              {onCheckOff && (
                <Button
                  onClick={handleCheckOffWrapper}
                  size="lg"
                  className="h-12 px-8 bg-green-600 hover:bg-green-700 text-white whitespace-nowrap"
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  Check Off
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Current Part Inspection */}
        <div ref={inspectionSectionRef} className="scroll-mt-[200px]">

          <Card
            className={`border-4 shadow-2xl transition-all duration-500 ${inspectionHighlight
              ? 'border-blue-600 shadow-blue-400/50 scale-[1.02]'
              : 'border-blue-500'
              }`}
          >
            <CardHeader className={`bg-gradient-to-r from-blue-50 to-indigo-50 transition-all duration-500 ${inspectionHighlight ? 'bg-gradient-to-r from-blue-100 to-indigo-100' : ''
              }`}>
              <CardTitle className="text-3xl">Current Part Inspection</CardTitle>
              <CardDescription className="text-lg">
                Click PASS or NOT GOOD for each produced part
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              {!showDefectSelector ? (
                <div className="grid grid-cols-2 gap-8">
                  <Button
                    onClick={handleGoodClick}
                    size="lg"
                    className="h-48 text-4xl font-bold bg-green-600 hover:bg-green-700 text-white shadow-xl hover:shadow-2xl transition-all"
                  >
                    <CheckCircle className="h-16 w-16 mr-4" />
                    PASS
                  </Button>
                  <Button
                    onClick={handleNGClick}
                    size="lg"
                    className="h-48 text-4xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-xl hover:shadow-2xl transition-all"
                  >
                    <XCircle className="h-16 w-16 mr-4" />
                    NOT GOOD
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center gap-4 p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                    <AlertCircle className="h-8 w-8 text-red-600" />
                    <div>
                      <h3 className="font-bold text-xl text-red-900">
                        {editingProductId ? 'Edit Defect Reason' : 'Select Defect Reason'}
                      </h3>
                      <p className="text-red-700">Choose category and subcategory for this NOT GOOD part</p>
                    </div>
                  </div>

                  <DefectCategorySelector
                    defectReasons={defectReasons}
                    machineId={operatorSetup.machineId}
                    machineType={machines.find(m => m.id === operatorSetup.machineId)?.type || ''}
                    partId={operatorSetup.partId || ''}
                    value={currentDefect}
                    onChange={setCurrentDefect}
                  />

                  <div className="flex gap-4">
                    <Button
                      onClick={() => {
                        setShowDefectSelector(false);
                        setCurrentDefect(null);
                        setEditingProductId(null);
                      }}
                      variant="outline"
                      size="lg"
                      className="flex-1 h-16 text-xl"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDefectSave}
                      size="lg"
                      className="flex-1 h-16 text-xl bg-red-600 hover:bg-red-700"
                      disabled={!currentDefect}
                    >
                      {editingProductId ? 'Update Product' : 'Save NOT GOOD Part'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Defect Summary */}
        <Card className="border-2 border-slate-300 shadow-lg">
          <Collapsible open={summaryExpanded} onOpenChange={setSummaryExpanded}>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="cursor-pointer hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <CardTitle className="text-2xl">Production Summary</CardTitle>
                    {summaryExpanded ? (
                      <ChevronUp className="h-6 w-6" />
                    ) : (
                      <ChevronDown className="h-6 w-6" />
                    )}
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-8 w-8 text-green-600" />
                      <div>
                        <div className="text-sm text-slate-600">PASS</div>
                        <div className="text-3xl font-bold text-green-600">{goodCount}</div>
                      </div>
                    </div>
                    <Separator orientation="vertical" className="h-12" />
                    <div className="flex items-center gap-3">
                      <XCircle className="h-8 w-8 text-red-600" />
                      <div>
                        <div className="text-sm text-slate-600">NOT GOOD</div>
                        <div className="text-3xl font-bold text-red-600">{ngCount}</div>
                      </div>
                    </div>
                    <Separator orientation="vertical" className="h-12" />
                    <div className="flex items-center gap-3">
                      <Package className="h-8 w-8 text-blue-600" />
                      <div>
                        <div className="text-sm text-slate-600">TOTAL</div>
                        <div className="text-3xl font-bold text-blue-600">{totalCount}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <ScrollArea className="h-96 pr-4">
                  {products.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <Package className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-semibold">No products recorded yet</p>
                      <p className="text-sm mt-2">Start inspecting parts to build production history</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {products.map((product, index) => (
                        <div
                          key={product.id}
                          className={`p-4 rounded-lg border-2 ${product.status === 'good'
                            ? 'bg-green-50 border-green-300'
                            : 'bg-red-50 border-red-300'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <Badge
                                className={`text-lg px-4 py-1 ${product.status === 'good'
                                  ? 'bg-green-600'
                                  : 'bg-red-600'
                                  }`}
                              >
                                Part #{products.length - index}
                              </Badge>
                              <div className="flex items-center gap-2">
                                {product.status === 'good' ? (
                                  <CheckCircle className="h-6 w-6 text-green-600" />
                                ) : (
                                  <XCircle className="h-6 w-6 text-red-600" />
                                )}
                                <span className="font-bold text-lg">
                                  {product.status === 'good' ? 'PASS' : 'NOT GOOD'}
                                </span>
                              </div>
                              {product.status === 'ng' && (
                                <>
                                  <Separator orientation="vertical" className="h-8" />
                                  <div className="text-sm">
                                    <div className="font-semibold text-red-900">
                                      {product.defectCategory} → {product.defectSubcategory}
                                    </div>
                                    {product.comment && (
                                      <div className="text-red-700 mt-1">"{product.comment}"</div>
                                    )}
                                  </div>
                                </>
                              )}
                              <Separator orientation="vertical" className="h-8" />
                              <div className="text-xs text-slate-600 space-y-1">
                                <div><strong>Part:</strong> {product.partName}</div>
                                <div><strong>Die:</strong> {product.die || 'N/A'}</div>
                              </div>
                              <div className="text-xs text-slate-600 space-y-1">
                                <div><strong>Machine:</strong> {product.machineName}</div>
                                <div><strong>Time:</strong> {format(product.timestamp, 'HH:mm:ss')}</div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleEditProduct(product)}
                                variant="outline"
                                size="lg"
                                className="h-12 w-12"
                              >
                                <Edit3 className="h-5 w-5" />
                              </Button>
                              <Button
                                onClick={() => setProductToDelete(product)}
                                variant="outline"
                                size="lg"
                                className="h-12 w-12 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Downtime Event Recorder */}
        <Card className="border-2 border-yellow-400 shadow-lg">
          {!showDowntimeRecorder ? (
            <CardContent className="py-6">
              <Button
                onClick={handleAddDowntime}
                size="lg"
                className="w-full h-16 text-xl font-bold bg-yellow-600 hover:bg-yellow-700"
              >
                <Plus className="h-6 w-6 mr-3" />
                Add Downtime Event
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader className="bg-yellow-50">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-2xl flex items-center gap-3">
                      <AlertTriangle className="h-7 w-7 text-yellow-600" />
                      {editingDowntimeId ? 'Edit Downtime Event' : 'Record Downtime Event'}
                    </CardTitle>
                    <CardDescription className="text-base">
                      Enter start time, end time, and select downtime reason
                    </CardDescription>
                  </div>
                  {/* New Clock Display in Header */}
                  <div className="bg-white rounded-lg px-4 py-2 border-2 border-yellow-400 flex-shrink-0 shadow-sm">
                    <div className="text-[10px] uppercase tracking-wider text-yellow-600 font-bold mb-0.5">Current Time</div>
                    <div className="text-2xl font-bold text-slate-800 font-mono">
                      {format(currentTime, 'HH:mm:ss')}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">

                {/* Time Inputs */}
                <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="downtime-start" className="text-base font-semibold">
                      Start Time *
                    </Label>
                    <div className="space-y-2">
                      <Input
                        id="downtime-start"
                        type="time"
                        value={currentDowntime.startTime}
                        onChange={(e) => setCurrentDowntime({ ...currentDowntime, startTime: e.target.value })}
                        className={`h-16 text-xl font-bold border-2 border-yellow-400 text-slate-900 bg-white [color-scheme:light] transition-all ${startTimeHighlight ? 'ring-4 ring-blue-400 border-blue-500 bg-blue-50' : ''
                          }`}
                      />
                      <Button
                        type="button"
                        onClick={handleUseCurrentTimeStart}
                        variant="outline"
                        size="lg"
                        className="w-full h-12 text-base font-semibold border-2 border-blue-400 hover:bg-blue-50 hover:border-blue-500 gap-2 active:scale-95 transition-transform"
                      >
                        <Clock className="h-5 w-5 text-blue-600" />
                        Use Current Time
                        {currentDowntime.startTime && (
                          <CheckCircle className="h-5 w-5 text-green-600 ml-auto" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="downtime-end" className="text-base font-semibold">
                      End Time *
                    </Label>
                    <div className="space-y-2">
                      <Input
                        id="downtime-end"
                        type="time"
                        value={currentDowntime.endTime}
                        onChange={(e) => setCurrentDowntime({ ...currentDowntime, endTime: e.target.value })}
                        className={`h-16 text-xl font-bold border-2 border-yellow-400 text-slate-900 bg-white [color-scheme:light] transition-all ${endTimeHighlight ? 'ring-4 ring-blue-400 border-blue-500 bg-blue-50' : ''
                          }`}
                      />
                      <Button
                        type="button"
                        onClick={handleUseCurrentTimeEnd}
                        variant="outline"
                        size="lg"
                        className="w-full h-12 text-base font-semibold border-2 border-blue-400 hover:bg-blue-50 hover:border-blue-500 gap-2 active:scale-95 transition-transform"
                      >
                        <Clock className="h-5 w-5 text-blue-600" />
                        Use Current Time
                        {currentDowntime.endTime && (
                          <CheckCircle className="h-5 w-5 text-green-600 ml-auto" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">
                      Duration
                      <Badge className="ml-2 bg-green-600">Auto</Badge>
                    </Label>
                    {calculateDowntimeDuration(currentDowntime.startTime, currentDowntime.endTime) > 0 ? (
                      <div className="h-16 px-4 border-4 border-green-300 rounded-md flex items-center justify-center font-bold text-2xl bg-gradient-to-br from-green-50 to-emerald-50 text-green-700 animate-in fade-in zoom-in duration-300">
                        {calculateDowntimeDuration(currentDowntime.startTime, currentDowntime.endTime)} min
                      </div>
                    ) : (
                      <div className="h-16 px-4 border-4 border-slate-300 rounded-md flex items-center justify-center font-bold text-xl bg-slate-50 text-slate-400">
                        0 min
                      </div>
                    )}
                    <div className="text-center text-sm text-slate-600 font-semibold pt-2">
                      {currentDowntime.startTime && currentDowntime.endTime ? (
                        <span className="text-green-700">
                          {currentDowntime.startTime} → {currentDowntime.endTime}
                        </span>
                      ) : (
                        <span className="text-slate-400">Set times above</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Downtime Reason Selector */}
                <div className="bg-slate-50 p-6 rounded-lg border-2 border-slate-300">
                  <DowntimeReasonSelector
                    value={currentDowntime.reason}
                    onChange={(reason) => setCurrentDowntime({ ...currentDowntime, reason })}
                  />
                </div>

                {/* Die Replacement Section - Shown for any die-related issue */}
                {currentDowntime.reason &&
                  currentDowntime.reason.fullPath.toLowerCase().includes('die') &&
                  !currentDowntime.reason.fullPath.toLowerCase().includes('die change') &&
                  !editingDowntimeId && (
                    <div className="bg-purple-50 p-6 rounded-lg border-2 border-purple-300 animate-in fade-in slide-in-from-top-4">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="bg-purple-500 rounded-full p-2 flex-shrink-0">
                          <Factory className="h-5 w-5 text-white" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-purple-900 mb-1">Die Replacement</h4>
                          <p className="text-sm text-purple-800">
                            Was the die replaced during this downtime?
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-3">
                          <Label className="text-base font-semibold text-purple-900">
                            Die Changed?
                          </Label>
                          <div className="grid grid-cols-2 gap-4">
                            <Button
                              type="button"
                              onClick={() => {
                                setDieChanged(false);
                                setNewDieSelection('');
                              }}
                              variant={!dieChanged ? 'default' : 'outline'}
                              size="lg"
                              className={`h-16 text-xl font-bold ${!dieChanged
                                ? 'bg-slate-600 hover:bg-slate-700 text-white'
                                : 'border-2 border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                              {!dieChanged && <CheckCircle className="h-6 w-6 mr-2" />}
                              No
                            </Button>
                            <Button
                              type="button"
                              onClick={() => setDieChanged(true)}
                              variant={dieChanged ? 'default' : 'outline'}
                              size="lg"
                              className={`h-16 text-xl font-bold ${dieChanged
                                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                                : 'border-2 border-orange-300 hover:bg-orange-50'
                                }`}
                            >
                              {dieChanged && <CheckCircle className="h-6 w-6 mr-2" />}
                              Yes
                            </Button>
                          </div>
                        </div>

                        {dieChanged && (
                          <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                            <Label htmlFor="replacement-die" className="text-base font-semibold text-orange-900">
                              Select New Die *
                            </Label>
                            <Select
                              value={newDieSelection}
                              onValueChange={setNewDieSelection}
                            >
                              <SelectTrigger id="replacement-die" className="h-16 text-xl font-bold border-2 border-orange-400 bg-white">
                                <SelectValue placeholder="Choose new die..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableDies.length > 0 ? (
                                  availableDies.map((dieOption) => (
                                    <SelectItem key={dieOption.id} value={dieOption.name} className="text-lg py-3">
                                      {dieOption.name}
                                      {dieOption.name === currentDie && (
                                        <Badge className="ml-2 bg-blue-600">Current</Badge>
                                      )}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <SelectItem value="__none" disabled>No dies configured for this part</SelectItem>
                                )}
                              </SelectContent>
                            </Select>

                            {newDieSelection && (
                              <div className="bg-white p-4 rounded-lg border-2 border-orange-400 animate-in fade-in">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold text-orange-900">Die Change:</span>
                                  <span className="text-lg font-bold text-orange-900">
                                    {currentDie} → {newDieSelection}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                {/* Die Selector - Only shown for explicit Die Change downtime path */}
                {currentDowntime.reason && currentDowntime.reason.fullPath.toLowerCase().includes('die change') && !editingDowntimeId && (
                  <div className="bg-orange-50 p-6 rounded-lg border-2 border-orange-400 animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="bg-orange-500 rounded-full p-2 flex-shrink-0">
                        <Factory className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-bold text-orange-900 mb-1">Die Change Detected</h4>
                        <p className="text-sm text-orange-800">
                          Current die: <strong>{currentDie}</strong> → Select the new die below
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="new-die" className="text-base font-semibold text-orange-900">
                        Select New Die *
                      </Label>
                      <Select
                        value={newDieSelection}
                        onValueChange={setNewDieSelection}
                      >
                        <SelectTrigger id="new-die" className="h-16 text-xl font-bold border-2 border-orange-400">
                          <SelectValue placeholder="Choose new die..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableDies.length > 0 ? (
                            availableDies.map((dieOption) => (
                              <SelectItem key={dieOption.id} value={dieOption.name} className="text-lg py-3">
                                {dieOption.name}
                                {dieOption.name === currentDie && (
                                  <Badge className="ml-2 bg-blue-600">Current</Badge>
                                )}
                              </SelectItem>
                            ))
                          ) : (
                            <SelectItem value="__none" disabled>No dies configured for this part</SelectItem>
                          )}
                        </SelectContent>
                      </Select>

                      {newDieSelection && (
                        <div className="bg-white p-4 rounded-lg border-2 border-orange-400">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-orange-900">Die Change:</span>
                            <span className="text-lg font-bold text-orange-900">
                              {currentDie} → {newDieSelection}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Optional Comment */}
                <div className="space-y-3">
                  <Label htmlFor="downtime-comment" className="text-base font-semibold">
                    Optional Comment
                  </Label>
                  <Textarea
                    id="downtime-comment"
                    value={currentDowntime.comment}
                    onChange={(e) => setCurrentDowntime({ ...currentDowntime, comment: e.target.value })}
                    placeholder="Additional details about this downtime event..."
                    className="min-h-24 text-lg"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-4">
                  <Button
                    onClick={handleCancelDowntime}
                    variant="outline"
                    size="lg"
                    className="flex-1 h-16 text-xl"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveDowntime}
                    size="lg"
                    className="flex-1 h-16 text-xl bg-yellow-600 hover:bg-yellow-700"
                  >
                    <Save className="h-6 w-6 mr-2" />
                    {editingDowntimeId ? 'Update Event' : 'Save Event'}
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Downtime Summary */}
        <Card className="border-2 border-orange-300 shadow-lg">
          <Collapsible open={downtimeSummaryExpanded} onOpenChange={setDowntimeSummaryExpanded}>
            <CollapsibleTrigger className="w-full">
              <CardHeader className="cursor-pointer hover:bg-orange-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <CardTitle className="text-2xl">Downtime Summary</CardTitle>
                    {downtimeSummaryExpanded ? (
                      <ChevronUp className="h-6 w-6" />
                    ) : (
                      <ChevronDown className="h-6 w-6" />
                    )}
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-8 w-8 text-orange-600" />
                      <div>
                        <div className="text-sm text-slate-600">EVENTS</div>
                        <div className="text-3xl font-bold text-orange-600">{totalDowntimeEvents}</div>
                      </div>
                    </div>
                    <Separator orientation="vertical" className="h-12" />
                    <div className="flex items-center gap-3">
                      <Clock className="h-8 w-8 text-orange-600" />
                      <div>
                        <div className="text-sm text-slate-600">TOTAL TIME</div>
                        <div className="text-3xl font-bold text-orange-600">{totalDowntimeDuration} min</div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <ScrollArea className="h-96 pr-4">
                  {downtimeEvents.length === 0 ? (
                    <div className="text-center py-12 text-slate-500">
                      <Clock className="h-16 w-16 mx-auto mb-4 opacity-30" />
                      <p className="text-lg font-semibold">No downtime events recorded</p>
                      <p className="text-sm mt-2">Click "Add Downtime Event" to record machine downtime</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {downtimeEvents.map((event, index) => (
                        <div
                          key={event.id}
                          className="p-4 rounded-lg border-2 bg-orange-50 border-orange-300"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <Badge className="text-lg px-4 py-1 bg-orange-600">
                                Event #{downtimeEvents.length - index}
                              </Badge>
                              <div className="flex items-center gap-2">
                                <Clock className="h-6 w-6 text-orange-600" />
                                <span className="font-bold text-lg">
                                  {event.startTime} - {event.endTime}
                                </span>
                                <Badge className="bg-orange-800 text-white ml-2">
                                  {event.duration} min
                                </Badge>
                              </div>
                              <Separator orientation="vertical" className="h-8" />
                              <div className="text-sm flex-1">
                                <div className="font-semibold text-orange-900 mb-1">
                                  {event.reason.fullPath}
                                </div>
                                {event.comment && (
                                  <div className="text-orange-700 mt-1">"{event.comment}"</div>
                                )}
                                <div className="text-xs text-slate-600 mt-2 space-x-3">
                                  <span><strong>Part:</strong> {event.partName}</span>
                                  <span><strong>Die:</strong> {event.die || 'N/A'}</span>
                                  <span><strong>Time:</strong> {format(event.timestamp, 'HH:mm:ss')}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={() => handleEditDowntime(event)}
                                variant="outline"
                                size="lg"
                                className="h-12 w-12"
                              >
                                <Edit3 className="h-5 w-5" />
                              </Button>
                              <Button
                                onClick={() => handleDeleteDowntime(event.id)}
                                variant="destructive"
                                size="lg"
                                className="h-12 w-12"
                              >
                                <Trash2 className="h-5 w-5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Shift Comment */}
        <Card className="border-2 border-blue-400 shadow-lg">
          <CardHeader className="bg-blue-50">
            <CardTitle className="text-2xl flex items-center gap-3">
              <MessageSquare className="h-7 w-7 text-blue-600" />
              Shift Comment
            </CardTitle>
            <CardDescription className="text-base">
              General notes for this shift (Operator: {operatorSetup?.operatorName || 'N/A'}, Machine: {operatorSetup?.machineName || 'N/A'}, Part: {operatorSetup?.partName || 'N/A'}, Die: {operatorSetup?.die || 'N/A'})
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="space-y-3">
              <Label htmlFor="shift-comment" className="text-base font-semibold">
                Operator Notes, Machine Observations, or Production Issues
              </Label>
              <Textarea
                id="shift-comment"
                value={shiftComment}
                onChange={(e) => setShiftComment(e.target.value)}
                placeholder="Enter any notes, observations, or issues for this shift..."
                className="min-h-32 text-lg"
              />
            </div>
            <Button
              onClick={handleSaveShiftComment}
              size="lg"
              className="w-full h-16 text-xl bg-blue-600 hover:bg-blue-700"
            >
              <Save className="h-6 w-6 mr-2" />
              Save Shift Comment
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Checkoff Counter End Dialog */}
      <Dialog open={checkoffDialogOpen} onOpenChange={setCheckoffDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-3">
              <div className="bg-green-500 rounded-full p-2">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              End of Shift Check-Off
            </DialogTitle>
            <DialogDescription className="text-base">
              Enter the current machine counter reading to complete your shift.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Counter Start Reference */}
            <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600">Counter Start (beginning of shift)</span>
                <span className="text-2xl font-bold text-slate-900">
                  {operatorSetup?.counterStart ?? 0}
                </span>
              </div>
            </div>

            {/* Counter End Input */}
            <div className="space-y-3">
              <Label htmlFor="counter-end" className="text-lg font-semibold">
                Machine Counter Reading Now *
              </Label>
              <Input
                id="counter-end"
                type="number"
                min="0"
                placeholder="e.g., 12500"
                value={counterEndInput}
                onChange={(e) => setCounterEndInput(e.target.value)}
                className="h-20 text-3xl font-bold text-center border-4 border-green-400 bg-white"
                autoFocus
              />
            </div>

            {/* Gross Count Preview */}
            {counterEndInput && !isNaN(parseInt(counterEndInput)) && (
              <div className={`border-2 rounded-lg p-4 ${parseInt(counterEndInput) - (operatorSetup?.counterStart || 0) >= 0
                ? 'bg-green-50 border-green-300'
                : 'bg-red-50 border-red-300'
                }`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Gross Count (Counter End − Counter Start)</span>
                  <span className={`text-2xl font-bold ${parseInt(counterEndInput) - (operatorSetup?.counterStart || 0) >= 0
                    ? 'text-green-700'
                    : 'text-red-700'
                    }`}>
                    {parseInt(counterEndInput) - (operatorSetup?.counterStart || 0)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-3">
            <Button
              variant="outline"
              onClick={() => setCheckoffDialogOpen(false)}
              className="h-14 text-lg px-8"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCheckOff}
              className="h-14 text-lg px-8 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="h-5 w-5 mr-2" />
              Confirm Check-Off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Product Dialog */}
      <Dialog open={!!productToEdit} onOpenChange={(open) => !open && setProductToEdit(null)}>
        <DialogContent className="w-[95vw] max-w-none sm:max-w-[70vw] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="text-2xl">Edit Product Entry</DialogTitle>
            <DialogDescription>
              Change the status of this product or edit the defect reason.
            </DialogDescription>
          </DialogHeader>
          {productToEdit && (
            <div className="flex flex-col gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  className={`h-16 text-xl ${productToEdit.status === 'good' ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : 'hover:bg-green-50 hover:text-green-600'}`}
                  onClick={() => setProductToEdit({
                    ...productToEdit,
                    status: 'good',
                    defectCategory: undefined,
                    defectSubcategory: undefined,
                    comment: undefined
                  })}
                >
                  <CheckCircle className="h-6 w-6 mr-2" />
                  PASS
                </Button>
                <Button
                  variant="outline"
                  className={`h-16 text-xl ${productToEdit.status === 'ng' ? 'bg-red-600 hover:bg-red-700 text-white border-red-600' : 'hover:bg-red-50 hover:text-red-600'}`}
                  onClick={() => setProductToEdit({ ...productToEdit, status: 'ng' })}
                >
                  <XCircle className="h-6 w-6 mr-2" />
                  NOT GOOD
                </Button>
              </div>

              {productToEdit.status === 'ng' && (
                <div className="border-t pt-4">
                  <h4 className="text-lg font-semibold mb-4 text-slate-800">Defect Details</h4>
                  <DefectCategorySelector
                    defectReasons={defectReasons}
                    machineId={operatorSetup?.machineId || ''}
                    machineType={machines.find(m => m.id === operatorSetup?.machineId)?.type || ''}
                    partId={operatorSetup?.partId || ''}
                    value={
                      productToEdit.defectCategory && productToEdit.defectSubcategory
                        ? {
                          category: productToEdit.defectCategory,
                          subcategory: productToEdit.defectSubcategory,
                          comment: productToEdit.comment
                        }
                        : null
                    }
                    onChange={(val) => {
                      if (val) {
                        setProductToEdit({
                          ...productToEdit,
                          defectCategory: val.category,
                          defectSubcategory: val.subcategory,
                          comment: val.comment
                        });
                      } else {
                        setProductToEdit({
                          ...productToEdit,
                          defectCategory: undefined,
                          defectSubcategory: undefined,
                          comment: undefined
                        });
                      }
                    }}
                  />
                </div>
              )}

              <DialogFooter className="gap-2 mt-4 pt-4 border-t">
                <Button variant="outline" onClick={() => setProductToEdit(null)} className="h-12 bg-white w-full sm:w-auto">
                  Cancel
                </Button>
                <Button onClick={saveProductEdit} className="h-12 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto">
                  Save Changes
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Product Confirmation Dialog */}
      <Dialog open={!!productToDelete} onOpenChange={(open) => !open && setProductToDelete(null)}>
        <DialogContent className="max-w-md border-red-200 bg-red-50">
          <DialogHeader>
            <DialogTitle className="text-2xl text-red-700">Delete Product</DialogTitle>
            <DialogDescription className="text-red-600 font-medium text-base">
              Are you sure you want to delete this product entry?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => setProductToDelete(null)}
              className="h-12 bg-white"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteProduct}
              variant="destructive"
              className="h-12"
            >
              <Trash2 className="h-5 w-5 mr-2" />
              Delete Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

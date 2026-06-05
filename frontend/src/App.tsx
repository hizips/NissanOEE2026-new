import type {
  Machine,
  ProductionRecord,
  Operator,
  Part,
  DefectReason,
  DowntimeReasonItem,
  ProcessReason,
  ScheduledDowntime,
  PartProductionHistory,
  DowntimeEventHistory
} from '@/types';
import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dashboard } from '@/components/Dashboard';
import { DataEntry } from '@/components/DataEntry';
import { MachineManagement } from '@/components/MachineManagement';
import { HistoricalData } from '@/components/HistoricalData';
import { Login } from '@/components/Login';
import { OperatorSetup, type OperatorSetupData } from '@/components/OperatorSetup';
import { OperatorManagement } from '@/components/OperatorManagement';
import { PartManagement } from '@/components/PartManagement';
import { ReasonManagement } from '@/components/ReasonManagement';
import { ProductionRecordManagement } from '@/components/ProductionRecordManagement';
import { ScheduledDowntimeManagement } from '@/components/ScheduledDowntimeManagement';
import { Toaster } from '@/components/ui/sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Factory, Clock, Calendar, LogOut, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  operatorApi, partApi, machineApi, defectReasonApi,
  downtimeReasonApi, processReasonApi, scheduledDowntimeApi,
  productionRecordApi, partProductionHistoryApi, downtimeEventHistoryApi,
  addDieToPart, removeDieFromPart
} from '@/services/api';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    const saved = sessionStorage.getItem('oee-authenticated');
    return saved === 'true';
  });

  const [currentUser, setCurrentUser] = useState<{ employeeId: string; role: 'operator' | 'manager' } | null>(() => {
    const saved = sessionStorage.getItem('oee-current-user');
    return saved ? JSON.parse(saved) : null;
  });

  const [loginTimestamp, setLoginTimestamp] = useState<Date>(() => {
    const saved = sessionStorage.getItem('oee-login-timestamp');
    return saved ? new Date(saved) : new Date();
  });

  const [operators, setOperators] = useState<Operator[]>([]);
  const [parts, setParts] = useState<Part[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [defectReasons, setDefectReasons] = useState<DefectReason[]>([]);
  const [downtimeReasons, setDowntimeReasons] = useState<DowntimeReasonItem[]>([]);
  const [processReasons, setProcessReasons] = useState<ProcessReason[]>([]);
  const [scheduledDowntimes, setScheduledDowntimes] = useState<ScheduledDowntime[]>([]);
  const [productionRecords, setProductionRecords] = useState<ProductionRecord[]>([]);
  const [partProductionHistory, setPartProductionHistory] = useState<PartProductionHistory[]>([]);
  const [downtimeEventHistory, setDowntimeEventHistory] = useState<DowntimeEventHistory[]>([]);

  const [operatorSetup, setOperatorSetup] = useState<OperatorSetupData | null>(null);
  const [showOperatorSetup, setShowOperatorSetup] = useState(false);
  const [setupMode, setSetupMode] = useState<'new' | 'edit' | 'partcast-change'>('new');

  // Load all data from API on authentication
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadData = async () => {
      try {
        const [
          ops, pts, mchs,
          defects, downtimes, processes, schedules,
          records, partHist, dtHist
        ] = await Promise.all([
          operatorApi.getAll(),
          partApi.getAll(),
          machineApi.getAll(),
          defectReasonApi.getAll(),
          downtimeReasonApi.getAll(),
          processReasonApi.getAll(),
          scheduledDowntimeApi.getAll(),
          productionRecordApi.getAll(),
          partProductionHistoryApi.getAll(),
          downtimeEventHistoryApi.getAll(),
        ]);

        setOperators(ops);
        setParts(pts);
        setMachines(mchs);
        setDefectReasons(defects);
        setDowntimeReasons(downtimes);
        setProcessReasons(processes);
        setScheduledDowntimes(schedules);
        setProductionRecords(records);
        setPartProductionHistory(partHist);
        setDowntimeEventHistory(dtHist);
      } catch (err) {
        console.error("Failed to load initial data from API", err);
        toast.error("Failed to load data from server. Please check your connection.");
      }
    };

    loadData();
  }, [isAuthenticated]);

  const addProductionRecord = async (record: Omit<ProductionRecord, 'id' | 'timestamp'>) => {
    try {
      const newRecord = await productionRecordApi.create(record);
      setProductionRecords([newRecord, ...productionRecords]);
      return newRecord;
    } catch (e) {
      toast.error('Failed to save record to server');
      throw e;
    }
  };

  const updateProductionRecord = async (id: string, updates: Partial<ProductionRecord>) => {
    try {
      const updated = await productionRecordApi.patch(id, updates);
      setProductionRecords(productionRecords.map(r => r.id === id ? { ...r, ...updated } : r));
      return updated;
    } catch (e) {
      toast.error('Failed to update record on server');
      throw e;
    }
  };

  const updateMachine = async (id: string, updates: Partial<Machine>) => {
    try {
      const updated = await machineApi.update(id, updates);
      setMachines(machines.map(m => m.id == id ? updated : m));
    } catch (e) {
      toast.error('Failed to update machine on server');
    }
  };

  const addMachine = async (machine: Omit<Machine, 'id'>) => {
    try {
      const newMachine = await machineApi.create(machine);
      setMachines([...machines, newMachine]);
    } catch (e) {
      toast.error('Failed to add machine to server');
    }
  };

  const deleteMachine = async (id: string) => {
    try {
      await machineApi.delete(id);
      setMachines(machines.filter(m => m.id != id));
    } catch (e) {
      toast.error('Failed to delete machine from server');
    }
  };

  const addOperator = async (operator: Omit<Operator, 'id'>) => {
    try {
      const newOp = await operatorApi.create(operator);
      setOperators([...operators, newOp]);
    } catch (e) {
      toast.error('Failed to add operator');
    }
  };

  const updateOperator = async (id: string, updates: Partial<Operator>) => {
    try {
      const updated = await operatorApi.update(id, updates);
      setOperators(operators.map(op => op.id == id ? updated : op));
    } catch (e) {
      toast.error('Failed to update operator');
    }
  };

  const deleteOperator = async (id: string) => {
    try {
      await operatorApi.delete(id);
      setOperators(operators.filter(op => op.id != id));
    } catch (e) {
      toast.error('Failed to delete operator');
    }
  };

  const addPart = async (part: Omit<Part, 'id'>) => {
    try {
      const newPart = await partApi.create(part);
      setParts([...parts, newPart]);
    } catch (e) {
      toast.error('Failed to add part');
    }
  };

  const updatePart = async (id: string, updates: Partial<Part>) => {
    try {
      const updated = await partApi.patch(id, updates);
      setParts(parts.map(p => p.id == id ? updated : p));
    } catch (e) {
      toast.error('Failed to update part');
    }
  };

  const handleAddDieToPart = async (partId: string, currentDieIds: string[], dieName: string, dieNumber: string) => {
    try {
      const { part: updatedPart } = await addDieToPart(partId, currentDieIds, dieName, dieNumber);
      setParts(prev => prev.map(p => p.id == partId ? updatedPart : p));
      toast.success('Die added successfully');
      return updatedPart;
    } catch (e) {
      toast.error('Failed to add die');
      throw e;
    }
  };

  const handleRemoveDieFromPart = async (partId: string, currentDieIds: string[], dieIdToRemove: string) => {
    try {
      const updatedPart = await removeDieFromPart(partId, currentDieIds, dieIdToRemove);
      setParts(prev => prev.map(p => p.id == partId ? updatedPart : p));
      toast.success('Die removed successfully');
      return updatedPart;
    } catch (e) {
      toast.error('Failed to remove die');
      throw e;
    }
  };

  const deletePart = async (id: string) => {
    try {
      await partApi.delete(id);
      setParts(parts.filter(p => p.id != id));
    } catch (e) {
      toast.error('Failed to delete part');
    }
  };

  const deleteProductionRecord = async (id: string) => {
    try {
      await productionRecordApi.delete(id);
      setProductionRecords(productionRecords.filter(r => r.id != id));
    } catch (e) {
      toast.error('Failed to delete record');
    }
  };

  // Defect Reason Management
  const addDefectReason = async (reason: Omit<DefectReason, 'id'>) => {
    try {
      const created = await defectReasonApi.create(reason);
      setDefectReasons([...defectReasons, created]);
    } catch (e) {
      toast.error('Failed to add defect reason');
    }
  };

  const updateDefectReason = async (id: string, updates: Partial<DefectReason>) => {
    try {
      const updated = await defectReasonApi.update(id, updates);
      setDefectReasons(defectReasons.map(r => r.id == id ? updated : r));
    } catch (e) {
      toast.error('Failed to update defect reason');
    }
  };

  const deleteDefectReason = async (id: string) => {
    try {
      await defectReasonApi.delete(id);
      setDefectReasons(defectReasons.filter(r => r.id != id));
    } catch (e) {
      toast.error('Failed to delete defect reason');
    }
  };

  // Downtime Reason Management
  const addDowntimeReason = async (reason: Omit<DowntimeReasonItem, 'id'>) => {
    try {
      const created = await downtimeReasonApi.create(reason);
      setDowntimeReasons([...downtimeReasons, created]);
    } catch (e) {
      toast.error('Failed to add downtime reason');
    }
  };

  const updateDowntimeReason = async (id: string, updates: Partial<DowntimeReasonItem>) => {
    try {
      const updated = await downtimeReasonApi.update(id, updates);
      setDowntimeReasons(downtimeReasons.map(r => r.id == id ? updated : r));
    } catch (e) {
      toast.error('Failed to update downtime reason');
    }
  };

  const deleteDowntimeReason = async (id: string) => {
    try {
      await downtimeReasonApi.delete(id);
      setDowntimeReasons(downtimeReasons.filter(r => r.id != id));
    } catch (e) {
      toast.error('Failed to delete downtime reason');
    }
  };

  // Process Reason Management
  const addProcessReason = async (reason: Omit<ProcessReason, 'id'>) => {
    try {
      const created = await processReasonApi.create(reason);
      setProcessReasons([...processReasons, created]);
    } catch (e) {
      toast.error('Failed to add process reason');
    }
  };

  const updateProcessReason = async (id: string, updates: Partial<ProcessReason>) => {
    try {
      const updated = await processReasonApi.update(id, updates);
      setProcessReasons(processReasons.map(r => r.id == id ? updated : r));
    } catch (e) {
      toast.error('Failed to update process reason');
    }
  };

  const deleteProcessReason = async (id: string) => {
    try {
      await processReasonApi.delete(id);
      setProcessReasons(processReasons.filter(r => r.id != id));
    } catch (e) {
      toast.error('Failed to delete process reason');
    }
  };

  // Scheduled Downtime Management
  const addScheduledDowntime = async (downtime: Omit<ScheduledDowntime, 'id'>) => {
    try {
      const created = await scheduledDowntimeApi.create(downtime);
      setScheduledDowntimes([...scheduledDowntimes, created]);
    } catch (e) {
      toast.error('Failed to add scheduled downtime');
    }
  };

  const updateScheduledDowntime = async (id: string, updates: Partial<ScheduledDowntime>) => {
    try {
      const updated = await scheduledDowntimeApi.update(id, updates);
      setScheduledDowntimes(scheduledDowntimes.map(d => d.id == id ? updated : d));
    } catch (e) {
      toast.error('Failed to update scheduled downtime');
    }
  };

  const deleteScheduledDowntime = async (id: string) => {
    try {
      await scheduledDowntimeApi.delete(id);
      setScheduledDowntimes(scheduledDowntimes.filter(d => d.id != id));
    } catch (e) {
      toast.error('Failed to delete scheduled downtime');
    }
  };

  // Part Production History Management
  const addPartProductionHistory = async (record: Omit<PartProductionHistory, 'id' | 'timestamp'>) => {
    try {
      const created = await partProductionHistoryApi.create(record);
      setPartProductionHistory([created, ...partProductionHistory]);
    } catch (e) {
      toast.error('Failed to add history');
    }
  };

  const deletePartProductionHistory = async (id: string) => {
    try {
      await partProductionHistoryApi.delete(id);
      setPartProductionHistory(partProductionHistory.filter(r => r.id != id));
    } catch (e) {
      toast.error('Failed to delete history');
    }
  };

  // Downtime Event History Management
  const addDowntimeEventHistory = async (event: Omit<DowntimeEventHistory, 'id' | 'timestamp'>) => {
    try {
      const created = await downtimeEventHistoryApi.create(event);
      setDowntimeEventHistory([created, ...downtimeEventHistory]);
    } catch (e) {
      toast.error('Failed to add event');
    }
  };

  const deleteDowntimeEventHistory = async (id: string) => {
    try {
      await downtimeEventHistoryApi.delete(id);
      setDowntimeEventHistory(downtimeEventHistory.filter(e => e.id != id));
    } catch (e) {
      toast.error('Failed to delete event');
    }
  };

  const handleLogin = (employeeId: string, role: 'operator' | 'manager') => {
    const user = { employeeId, role };
    const timestamp = new Date();
    setCurrentUser(user);
    setLoginTimestamp(timestamp);
    setIsAuthenticated(true);
    sessionStorage.setItem('oee-authenticated', 'true');
    sessionStorage.setItem('oee-current-user', JSON.stringify(user));
    sessionStorage.setItem('oee-login-timestamp', timestamp.toISOString());

    // For operators, show the setup screen after login
    if (role === 'operator') {
      setShowOperatorSetup(true);
    }
  };

  const handleStartWork = (setupData: OperatorSetupData) => {
    setOperatorSetup(setupData);
    setShowOperatorSetup(false);
    setSetupMode('new');
  };

  const handleEditSetup = () => {
    setSetupMode('edit');
    setShowOperatorSetup(true);
  };

  const handleCheckOff = () => {
    // Save current production record if needed
    toast.success('Checked off successfully. Ready for next operator.');

    // Reset everything
    setOperatorSetup(null);
    setShowOperatorSetup(true);
    setSetupMode('new');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser(null);
    setOperatorSetup(null);
    setShowOperatorSetup(false);
    sessionStorage.removeItem('oee-authenticated');
    sessionStorage.removeItem('oee-current-user');
    sessionStorage.removeItem('oee-login-timestamp');
    toast.success('Logged out successfully');
  };

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getCurrentShift = (): { name: string; color: string } => {
    const hour = currentTime.getHours();
    if (hour >= 6 && hour < 14) return { name: 'Morning Shift', color: 'bg-blue-500' };
    if (hour >= 14 && hour < 22) return { name: 'Afternoon Shift', color: 'bg-amber-500' };
    return { name: 'Night Shift', color: 'bg-indigo-500' };
  };

  const currentShift = getCurrentShift();
  const runningMachines = machines.filter(m => m.status === 'running').length;
  const totalMachines = machines.length;

  if (!isAuthenticated) {
    return (
      <>
        <Login onLogin={handleLogin} />
        <Toaster />
      </>
    );
  }

  // Show operator setup after operator login
  if (currentUser?.role === 'operator' && showOperatorSetup) {
    return (
      <>
        <OperatorSetup
          machines={machines}
          operators={operators}
          parts={parts}
          onStartWork={handleStartWork}
          existingSetup={setupMode !== 'new' ? operatorSetup || undefined : undefined}
          mode={setupMode}
        />
        <Toaster />
      </>
    );
  }

  const updatePartProductionHistory = async (id: string, updates: Partial<PartProductionHistory>) => {
    try {
      const updated = await partProductionHistoryApi.patch(id, updates);
      setPartProductionHistory(prev =>
        prev.map(record => (record.id === id ? { ...record, ...updated } : record))
      );
      toast.success('Part history updated');
    } catch (e) {
      toast.error('Failed to update part history on server');
    }
  };

  const updateDowntimeEventHistory = async (id: string, updates: Partial<DowntimeEventHistory>) => {
    try {
      const updated = await downtimeEventHistoryApi.patch(id, updates);
      setDowntimeEventHistory(prev =>
        prev.map(event => (event.id === id ? { ...event, ...updated } : event))
      );
      toast.success('Downtime event updated');
    } catch (e) {
      toast.error('Failed to update downtime event on server');
    }
  };

  return (
    <>
      <div className="min-h-screen bg-[#F1F5F9]">
        <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-6 py-4 shadow-lg">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <Factory className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white whitespace-nowrap leading-tight">
                    OEE Management System
                  </p>
                  <p className="text-sm text-slate-300">Casting Factory Production Monitoring</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span className="font-semibold">{format(currentTime, 'MMM dd, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span className="font-mono font-semibold">{format(currentTime, 'HH:mm:ss')}</span>
                </div>
                <Badge className={`${currentShift.color} text-white px-3 py-1`}>
                  {currentShift.name}
                </Badge>
                <div className="text-sm">
                  <span className="text-slate-400">Machines:</span>
                  <span className="ml-2 font-semibold">
                    {runningMachines}/{totalMachines} Running
                  </span>
                </div>
                <div className="h-8 w-px bg-slate-600"></div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" />
                      {currentUser?.employeeId}
                    </div>
                    <div className="text-xs text-slate-400 capitalize">
                      {currentUser?.role}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleLogout}
                    className="gap-2 bg-slate-700 border-slate-600 text-white hover:bg-slate-600 hover:text-white h-12 px-6"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="font-semibold">Logout</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-8">
          <Tabs defaultValue={currentUser?.role === 'operator' ? 'entry' : 'dashboard'} className="space-y-6">
            {currentUser?.role === 'manager' ? (
              <TabsList className="grid w-full grid-cols-8 h-14 shadow-sm border border-slate-200">
                <TabsTrigger value="dashboard" className="text-base h-full">Dashboard</TabsTrigger>
                <TabsTrigger value="records" className="text-base h-full">Shift Records</TabsTrigger>
                <TabsTrigger value="history" className="text-base h-full">History</TabsTrigger>
                <TabsTrigger value="operators" className="text-base h-full">Operators</TabsTrigger>
                <TabsTrigger value="machines" className="text-base h-full">Machines</TabsTrigger>
                <TabsTrigger value="parts" className="text-base h-full">Parts</TabsTrigger>
                <TabsTrigger value="reasons" className="text-base h-full">Reasons</TabsTrigger>
                <TabsTrigger value="downtime" className="text-base h-full">Scheduled Downtime</TabsTrigger>
              </TabsList>
            ) : (
              <div className="max-w-2xl">
                <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-lg shadow-lg">
                  <h2 className="text-2xl font-bold mb-2">Operator Data Entry</h2>
                  <p className="text-blue-100">Record production data for your current shift</p>
                </div>
              </div>
            )}

            {currentUser?.role === 'manager' && (
              <>
                <TabsContent value="dashboard">
                  <Dashboard
                    machines={machines}
                    productionRecords={productionRecords}
                  />
                </TabsContent>

                <TabsContent value="records">
                  <ProductionRecordManagement
                    productionRecords={productionRecords}
                    partProductionHistory={partProductionHistory}
                    downtimeEventHistory={downtimeEventHistory}
                    machines={machines}
                    parts={parts}
                    defectReasons={defectReasons}
                    onUpdateRecord={updateProductionRecord}
                    onAddPartHistory={addPartProductionHistory}
                    onUpdatePartHistory={updatePartProductionHistory}
                    onDeletePartHistory={deletePartProductionHistory}
                    onAddDowntimeEvent={addDowntimeEventHistory}
                    onUpdateDowntimeEvent={updateDowntimeEventHistory}
                    onDeleteDowntimeEvent={deleteDowntimeEventHistory}
                  />
                </TabsContent>

                <TabsContent value="history">
                  <HistoricalData
                    productionRecords={productionRecords}
                    partProductionHistory={partProductionHistory}
                    downtimeEventHistory={downtimeEventHistory}
                    machines={machines}
                    parts={parts}
                    operators={operators}
                    defectReasons={defectReasons}
                    onDeleteRecord={deleteProductionRecord}
                    onDeletePartHistory={deletePartProductionHistory}
                    onDeleteDowntimeEvent={deleteDowntimeEventHistory}
                    onUpdatePartHistory={updatePartProductionHistory}
                    onUpdateDowntimeEvent={updateDowntimeEventHistory}
                    userRole={currentUser?.role || 'operator'}
                  />
                </TabsContent>

                <TabsContent value="machines">
                  <MachineManagement
                    machines={machines}
                    productionRecords={productionRecords}
                    parts={parts}
                    onUpdateMachine={updateMachine}
                    onAddMachine={addMachine}
                    onDeleteMachine={deleteMachine}
                    userRole={currentUser?.role || 'operator'}
                  />
                </TabsContent>

                <TabsContent value="operators">
                  <OperatorManagement
                    operators={operators}
                    onAddOperator={addOperator}
                    onUpdateOperator={updateOperator}
                    onDeleteOperator={deleteOperator}
                  />
                </TabsContent>

                <TabsContent value="parts">
                  <PartManagement
                    parts={parts}
                    onAddPart={addPart}
                    onUpdatePart={updatePart}
                    onDeletePart={deletePart}
                    onAddDie={handleAddDieToPart}
                    onRemoveDie={handleRemoveDieFromPart}
                  />
                </TabsContent>

                <TabsContent value="reasons">
                  <ReasonManagement
                    defectReasons={defectReasons}
                    downtimeReasons={downtimeReasons}
                    processReasons={processReasons}
                    machines={machines}
                    parts={parts}
                    onAddDefectReason={addDefectReason}
                    onUpdateDefectReason={updateDefectReason}
                    onDeleteDefectReason={deleteDefectReason}
                    onAddDowntimeReason={addDowntimeReason}
                    onUpdateDowntimeReason={updateDowntimeReason}
                    onDeleteDowntimeReason={deleteDowntimeReason}
                    onAddProcessReason={addProcessReason}
                    onUpdateProcessReason={updateProcessReason}
                    onDeleteProcessReason={deleteProcessReason}
                  />
                </TabsContent>

                <TabsContent value="downtime">
                  <ScheduledDowntimeManagement
                    scheduledDowntimes={scheduledDowntimes}
                    machines={machines}
                    onAdd={addScheduledDowntime}
                    onUpdate={updateScheduledDowntime}
                    onDelete={deleteScheduledDowntime}
                  />
                </TabsContent>
              </>
            )}

            {currentUser?.role === 'operator' && (
              <TabsContent value="entry">
                <DataEntry
                  machines={machines}
                  parts={parts}
                  defectReasons={defectReasons}
                  onUpdatePartHistory={updatePartProductionHistory}
                  onAddRecord={addProductionRecord}
                  onUpdateRecord={updateProductionRecord}
                  onAddPartHistory={addPartProductionHistory}
                  onAddDowntimeEvent={addDowntimeEventHistory}
                  currentUser={currentUser}
                  loginTimestamp={loginTimestamp}
                  operatorSetup={operatorSetup || undefined}
                  onEditSetup={handleEditSetup}
                  onCheckOff={handleCheckOff}
                />
              </TabsContent>
            )}
          </Tabs>
        </main>
      </div>
      <Toaster />
    </>
  );
}

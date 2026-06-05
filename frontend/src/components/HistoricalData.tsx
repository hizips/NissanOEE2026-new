import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  Machine,
  ProductionRecord,
  PartProductionHistory,
  DowntimeEventHistory,
  Part,
  Operator,
  DefectReason
} from '@/types';
import {
  History,
  Search,
  Trash2,
  Edit3,
  Download,
  Filter,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertTriangle,
  Package,
  CheckCircle,
  XCircle,
  Factory
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label'; // Ensure Label is imported

import { toast } from 'sonner';

interface HistoricalDataProps {
  productionRecords: ProductionRecord[];
  partProductionHistory: PartProductionHistory[];
  downtimeEventHistory: DowntimeEventHistory[];
  machines: Machine[];
  parts: Part[];
  operators: Operator[];
  defectReasons: DefectReason[];
  onDeleteRecord: (id: string) => void;
  onDeletePartHistory: (id: string) => void;
  onDeleteDowntimeEvent: (id: string) => void;
  userRole: 'operator' | 'manager';
  onUpdatePartHistory: (id: string, updates: Partial<PartProductionHistory>) => void;
  onUpdateDowntimeEvent: (id: string, updates: Partial<DowntimeEventHistory>) => void;
}

export function HistoricalData({
  productionRecords,
  partProductionHistory,
  downtimeEventHistory,
  machines,
  parts,
  operators,
  defectReasons,
  onUpdatePartHistory,
  onUpdateDowntimeEvent,
  onDeleteRecord,
  onDeletePartHistory,
  onDeleteDowntimeEvent,
  userRole
}: HistoricalDataProps) {
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMachine, setFilterMachine] = useState<string>('all');
  const [filterOperator, setFilterOperator] = useState<string>('all');
  const [filterPart, setFilterPart] = useState<string>('all');
  const [filterShift, setFilterShift] = useState<string>('all');
  const [filterResult, setFilterResult] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // UI state
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: 'part' | 'downtime' } | null>(null);

  // Filter functions
  const filteredPartHistory = useMemo(() => {
    return partProductionHistory.filter(record => {
      const matchesSearch =
        record.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.operatorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.partName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.comment?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesMachine = filterMachine === 'all' || record.machineId === filterMachine;
      const matchesOperator = filterOperator === 'all' || record.operatorName === filterOperator;
      const matchesPart = filterPart === 'all' || record.partName === filterPart;
      const matchesShift = filterShift === 'all' || record.shift === filterShift;
      const matchesResult = filterResult === 'all' || record.result === filterResult;
      const matchesDateFrom = !filterDateFrom || record.date >= filterDateFrom;
      const matchesDateTo = !filterDateTo || record.date <= filterDateTo;

      return matchesSearch && matchesMachine && matchesOperator && matchesPart &&
        matchesShift && matchesResult && matchesDateFrom && matchesDateTo;
    });
  }, [partProductionHistory, searchTerm, filterMachine, filterOperator, filterPart, filterShift, filterResult, filterDateFrom, filterDateTo]);

  const filteredDowntimeEvents = useMemo(() => {
    return downtimeEventHistory.filter(event => {
      const matchesSearch =
        event.machineName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.operatorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.reason.fullPath.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.comment?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesMachine = filterMachine === 'all' || event.machineId === filterMachine;
      const matchesOperator = filterOperator === 'all' || event.operatorName === filterOperator;
      const matchesShift = filterShift === 'all' || event.shift === filterShift;
      const matchesDateFrom = !filterDateFrom || event.date >= filterDateFrom;
      const matchesDateTo = !filterDateTo || event.date <= filterDateTo;

      return matchesSearch && matchesMachine && matchesOperator && matchesShift &&
        matchesDateFrom && matchesDateTo;
    });
  }, [downtimeEventHistory, searchTerm, filterMachine, filterOperator, filterShift, filterDateFrom, filterDateTo]);

  // Group by machine
  const machineGroups = useMemo(() => {
    const groups: {
      [machineId: string]: {
        machine: Machine;
        partHistory: PartProductionHistory[];
        downtimeEvents: DowntimeEventHistory[];
        totalParts: number;
        passCount: number;
        notGoodCount: number;
        totalDowntime: number;
        topDefectReason: string;
      };
    } = {};

    // Initialize all machines
    machines.forEach(machine => {
      groups[machine.id] = {
        machine,
        partHistory: [],
        downtimeEvents: [],
        totalParts: 0,
        passCount: 0,
        notGoodCount: 0,
        totalDowntime: 0,
        topDefectReason: '-',
      };
    });

    // Group part history
    filteredPartHistory.forEach(record => {
      if (groups[record.machineId]) {
        groups[record.machineId].partHistory.push(record);
        groups[record.machineId].totalParts++;
        if (record.result === 'PASS') {
          groups[record.machineId].passCount++;
        } else {
          groups[record.machineId].notGoodCount++;
        }
      }
    });

    // Group downtime events
    filteredDowntimeEvents.forEach(event => {
      if (groups[event.machineId]) {
        groups[event.machineId].downtimeEvents.push(event);
        groups[event.machineId].totalDowntime += event.duration;
      }
    });

    // Calculate top defect reason for each machine
    Object.values(groups).forEach(group => {
      const defectCounts: { [key: string]: number } = {};
      group.partHistory.forEach(record => {
        if (record.result === 'NOT GOOD' && record.defectCategory && record.defectSubcategory) {
          const key = `${record.defectCategory} → ${record.defectSubcategory}`;
          defectCounts[key] = (defectCounts[key] || 0) + 1;
        }
      });
      const topDefect = Object.entries(defectCounts).sort((a, b) => b[1] - a[1])[0];
      if (topDefect) {
        group.topDefectReason = `${topDefect[0]} (${topDefect[1]})`;
      }
    });

    return groups;
  }, [machines, filteredPartHistory, filteredDowntimeEvents]);

  const toggleMachine = (machineId: string) => {
    const newExpanded = new Set(expandedMachines);
    if (newExpanded.has(machineId)) {
      newExpanded.delete(machineId);
    } else {
      newExpanded.add(machineId);
    }
    setExpandedMachines(newExpanded);
  };

  const handleDelete = (id: string, type: 'part' | 'downtime') => {
    setItemToDelete({ id, type });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      if (itemToDelete.type === 'part') {
        onDeletePartHistory(itemToDelete.id);
        toast.success('Part history deleted successfully');
      } else {
        onDeleteDowntimeEvent(itemToDelete.id);
        toast.success('Downtime event deleted successfully');
      }
      setItemToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const getShiftBadge = (shift: string) => {
    const colors = {
      morning: 'bg-blue-100 text-blue-800',
      afternoon: 'bg-amber-100 text-amber-800',
      night: 'bg-indigo-100 text-indigo-800',
    };
    return <Badge variant="outline" className={colors[shift as keyof typeof colors]}>{shift}</Badge>;
  };

  const exportToCSV = () => {
    const headers = [
      'Type',
      'Date',
      'Machine',
      'Shift',
      'Operator',
      'Part',
      'Die',
      'Result',
      'Defect Category',
      'Defect Subcategory',
      'Defect Specific Reason',
      'Downtime Duration',
      'Downtime Reason',
      'Comment',
      'Timestamp',
    ];

    const rows: string[][] = [];

    // Add part history rows
    filteredPartHistory.forEach(record => {
      rows.push([
        'Part',
        record.date,
        record.machineName,
        record.shift,
        record.operatorName,
        record.partName,
        record.die || '',
        record.result,
        record.defectCategory || '',
        record.defectSubcategory || '',
        record.defectSpecificReason || '',
        '',
        '',
        record.comment || '',
        new Date(record.timestamp).toISOString(),
      ]);
    });

    // Add downtime event rows
    filteredDowntimeEvents.forEach(event => {
      rows.push([
        'Downtime',
        event.date,
        event.machineName,
        event.shift,
        event.operatorName,
        '',
        '',
        '',
        '',
        '',
        '',
        event.duration.toString(),
        event.reason.fullPath,
        event.comment || '',
        new Date(event.timestamp).toISOString(),
      ]);
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Data exported successfully');
  };

  // Inside HistoricalData component...
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    id: string;
    type: 'part' | 'downtime';
    data: any;
  } | null>(null);

  const handleEdit = (record: any, type: 'part' | 'downtime') => {
    setEditingItem({ id: record.id, type, data: { ...record } });
    setEditDialogOpen(true);
  };

  //    const handleEditProduct = (product: ProductionRecord) => {
  //      setEditingProductId(product.id);
  //      
  //      // If it's already NG, load the existing defect
  //      if (product.status === 'ng' && product.defectCategory && product.defectSubcategory) {
  //        setCurrentDefect({
  //          category: product.defectCategory,
  //          subcategory: product.defectSubcategory,
  //          comment: product.comment,
  //        });
  //      } else {
  //        // If it was "PASS", reset the selector so they can pick a new reason
  //        setCurrentDefect(null);
  //      }
  //      
  //      setShowDefectSelector(true);
  //    };

  const saveEdit = () => {
    if (editingItem) {
      if (editingItem.type === 'part') {
        // Pass the ID and the modified data object directly
        onUpdatePartHistory(editingItem.id, editingItem.data);
      } else {
        onUpdateDowntimeEvent(editingItem.id, editingItem.data);
      }

      // Close dialog and reset state
      setEditDialogOpen(false);
      setEditingItem(null);
    }
  };

  return (
    <div className="bg-white space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle>Production History</CardTitle>
                <CardDescription>View detailed part production and downtime event history by machine</CardDescription>
              </div>
            </div>
            <Button onClick={exportToCSV} variant="outline" className="bg-slate-950 text-white hover:bg-slate-800 gap-2 px-4 shadow-sm">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-900" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-slate-200 border-slate-200 focus:bg-white transition-all" // Added grey bg
              />
            </div>
            <Select value={filterMachine} onValueChange={setFilterMachine}>
              <SelectTrigger>
                <SelectValue placeholder="All Machines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Machines</SelectItem>
                {machines.map(machine => (
                  <SelectItem key={machine.id} value={machine.id}>
                    {machine.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterOperator} onValueChange={setFilterOperator}>
              <SelectTrigger>
                <SelectValue placeholder="All Operators" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operators</SelectItem>
                {[...new Set(partProductionHistory.map(p => p.operatorName))].map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPart} onValueChange={setFilterPart}>
              <SelectTrigger>
                <SelectValue placeholder="All Parts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parts</SelectItem>
                {[...new Set(partProductionHistory.map(p => p.partName))].map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterShift} onValueChange={setFilterShift}>
              <SelectTrigger>
                <SelectValue placeholder="All Shifts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shifts</SelectItem>
                <SelectItem value="morning">Morning</SelectItem>
                <SelectItem value="afternoon">Afternoon</SelectItem>
                <SelectItem value="night">Night</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterResult} onValueChange={setFilterResult}>
              <SelectTrigger>
                <SelectValue placeholder="All Results" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="PASS">PASS</SelectItem>
                <SelectItem value="NOT GOOD">NOT GOOD</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              placeholder="Date From"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="bg-slate-200 border-slate-200" // Added grey bg
            />
            <Input
              type="date"
              placeholder="Date To"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="bg-slate-200 border-slate-200" // Added grey bg
            />
          </div>

          {/* Machine Groups */}
          <div className="space-y-4">
            {Object.entries(machineGroups).map(([machineId, group]) => {
              const hasData = group.totalParts > 0 || group.downtimeEvents.length > 0;
              if (!hasData && (filterMachine !== 'all' && filterMachine !== machineId)) {
                return null;
              }

              const isExpanded = expandedMachines.has(machineId);

              return (
                <Card key={machineId} className="border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow mb-4">
                  <CardHeader
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => toggleMachine(machineId)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </Button>
                        <Factory className="h-5 w-5 text-blue-600" />
                        <div>
                          <h3 className="text-lg font-bold">{group.machine.name}</h3>
                          <p className="text-sm text-slate-600">
                            {group.machine.type.charAt(0).toUpperCase() + group.machine.type.slice(1)} Machine
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className="text-sm text-slate-600">Total Parts</div>
                          <div className="text-xl font-bold">{group.totalParts}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-slate-600">PASS</div>
                          <div className="text-xl font-bold text-green-600">{group.passCount}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-slate-600">NOT GOOD</div>
                          <div className="text-xl font-bold text-red-600">{group.notGoodCount}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm text-slate-600">Downtime</div>
                          <div className="text-xl font-bold text-orange-600">{group.totalDowntime} min</div>
                        </div>
                        <div className="text-left max-w-xs">
                          <div className="text-sm text-slate-600">Top NG Reason</div>
                          <div className="text-sm font-semibold truncate">{group.topDefectReason}</div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0">
                      <Tabs defaultValue="parts" className="space-y-4">
                        <TabsList>
                          <TabsTrigger value="parts" className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Package className="h-4 w-4" />
                            Part History ({group.partHistory.length})
                          </TabsTrigger>
                          <TabsTrigger value="downtime" className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                            <Clock className="h-4 w-4" />
                            Downtime Events ({group.downtimeEvents.length})
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="parts">
                          {group.partHistory.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 border border-dashed rounded-lg">
                              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                              <p>No part history for this machine</p>
                            </div>
                          ) : (
                            <div className="border rounded-lg overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Shift</TableHead>
                                    <TableHead>Operator</TableHead>
                                    <TableHead>Part</TableHead>
                                    <TableHead>Die</TableHead>
                                    <TableHead>Result</TableHead>
                                    <TableHead>Defect Reason</TableHead>
                                    <TableHead>Comment</TableHead>
                                    <TableHead>Time</TableHead>
                                    {userRole === 'manager' && <TableHead></TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.partHistory.map(record => (
                                    <TableRow key={record.id}>
                                      <TableCell className="font-medium">
                                        {format(parseISO(record.date), 'MMM dd, yyyy')}
                                      </TableCell>
                                      <TableCell>{getShiftBadge(record.shift)}</TableCell>
                                      <TableCell>{record.operatorName}</TableCell>
                                      <TableCell>{record.partName}</TableCell>
                                      <TableCell>{record.die || '-'}</TableCell>
                                      <TableCell>
                                        {record.result === 'PASS' ? (
                                          <Badge className="bg-green-600 gap-1">
                                            <CheckCircle className="h-3 w-3" />
                                            PASS
                                          </Badge>
                                        ) : (
                                          <Badge className="bg-red-600 gap-1">
                                            <XCircle className="h-3 w-3" />
                                            NOT GOOD
                                          </Badge>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        {record.result === 'NOT GOOD' && (
                                          <div className="space-y-1">
                                            <div className="text-sm font-semibold">
                                              {record.defectCategory}
                                            </div>
                                            <div className="text-xs text-slate-600">
                                              → {record.defectSubcategory}
                                            </div>
                                            {record.defectSpecificReason && (
                                              <div className="text-xs text-slate-500">
                                                → {record.defectSpecificReason}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </TableCell>
                                      <TableCell className="max-w-xs truncate text-sm text-slate-600">
                                        {record.comment || '-'}
                                      </TableCell>
                                      <TableCell className="text-sm text-slate-500">
                                        {format(new Date(record.timestamp), 'HH:mm:ss')}
                                      </TableCell>
                                      {userRole === 'manager' && (
                                        <TableCell className="text-right">
                                          <div className="flex justify-end gap-2">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleEdit(record, 'part')} // For parts tab
                                              // onClick={() => handleEdit(event, 'downtime')} // For downtime tab
                                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                            >
                                              <Edit3 className="h-4 w-4" />
                                              <span className="sr-only">Edit</span>
                                            </Button>

                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => handleDelete(record.id, 'part')}
                                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                              <Trash2 className="h-4 w-4" />
                                              <span className="sr-only">Delete</span>
                                            </Button>
                                          </div>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="downtime">
                          {group.downtimeEvents.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 border border-dashed rounded-lg">
                              <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                              <p>No downtime events for this machine</p>
                            </div>
                          ) : (
                            <div className="border rounded-lg overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Shift</TableHead>
                                    <TableHead>Operator</TableHead>
                                    <TableHead>Start Time</TableHead>
                                    <TableHead>End Time</TableHead>
                                    <TableHead>Duration</TableHead>
                                    <TableHead>Downtime Reason</TableHead>
                                    <TableHead>Comment</TableHead>
                                    {userRole === 'manager' && <TableHead></TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.downtimeEvents.map(event => (
                                    <TableRow key={event.id}>
                                      <TableCell className="font-medium">
                                        {format(parseISO(event.date), 'MMM dd, yyyy')}
                                      </TableCell>
                                      <TableCell>{getShiftBadge(event.shift)}</TableCell>
                                      <TableCell>{event.operatorName}</TableCell>
                                      <TableCell>{event.startTime}</TableCell>
                                      <TableCell>{event.endTime}</TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="bg-orange-50 border-orange-300">
                                          {event.duration} min
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2 flex-wrap">
                                          {event.reason.category && (
                                            <Badge className="bg-yellow-700">
                                              {event.reason.category}
                                            </Badge>
                                          )}
                                          {event.reason.subsystem && (
                                            <>
                                              <span className="text-slate-400">→</span>
                                              <Badge className="bg-yellow-600">
                                                {event.reason.subsystem}
                                              </Badge>
                                            </>
                                          )}
                                          {event.reason.component && (
                                            <>
                                              <span className="text-slate-400">→</span>
                                              <Badge className="bg-yellow-500">
                                                {event.reason.component}
                                              </Badge>
                                            </>
                                          )}
                                          {event.reason.specificItem && (
                                            <>
                                              <span className="text-slate-400">→</span>
                                              <Badge className="bg-yellow-400 text-slate-900">
                                                {event.reason.specificItem}
                                              </Badge>
                                            </>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="max-w-xs truncate text-sm text-slate-600">
                                        {event.comment || '-'}
                                      </TableCell>
                                      {userRole === 'manager' && (
                                        <TableCell>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(event.id, 'downtime')}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </Button>
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>

          {partProductionHistory.length === 0 && downtimeEventHistory.length === 0 && (
            <div className="text-center py-12 text-slate-500 border border-dashed rounded-lg">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No production history available yet.</p>
              <p className="text-sm mt-2">
                Part-level history will appear here as operators record production data.
              </p>
            </div>
          )}

          <div className="text-sm text-slate-600 text-center">
            Showing {filteredPartHistory.length} part records and {filteredDowntimeEvents.length} downtime events
          </div>
        </CardContent>
      </Card>

      {userRole === 'operator' && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              <div>
                <h4 className="font-semibold text-sm text-blue-900">Operator Access</h4>
                <p className="text-sm text-blue-700">You have view-only access to production history. Contact a manager to delete records.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {itemToDelete?.type === 'part' ? 'Part History' : 'Downtime Event'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {itemToDelete?.type === 'part' ? 'part history record' : 'downtime event'}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modify {editingItem?.type === 'part' ? 'Production Record' : 'Downtime Event'}</DialogTitle>
            <DialogDescription>
              Update all historical data fields. Note: Die selection is restricted to dies supported by the selected part.
            </DialogDescription>
          </DialogHeader>

          {editingItem && (
            <div className="grid grid-cols-2 gap-4 py-4">
              {/* --- Common Fields --- */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={editingItem.data.date}
                  onChange={(e) => setEditingItem({ ...editingItem, data: { ...editingItem.data, date: e.target.value } })}
                />
              </div>
              <div className="space-y-2">
                <Label>Shift</Label>
                <Select
                  value={editingItem.data.shift}
                  onValueChange={(v) => setEditingItem({ ...editingItem, data: { ...editingItem.data, shift: v } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="afternoon">Afternoon</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Machine</Label>
                <Select
                  value={editingItem.data.machineId}
                  onValueChange={(v) => {
                    const m = machines.find(mac => mac.id === v);
                    setEditingItem({
                      ...editingItem,
                      data: { ...editingItem.data, machineId: v, machineName: m?.name || '' }
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operator</Label>
                <Select
                  value={editingItem.data.operatorName}
                  onValueChange={(v) => setEditingItem({ ...editingItem, data: { ...editingItem.data, operatorName: v } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {operators.map(op => <SelectItem key={op.id} value={op.name}>{op.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* --- Part History Specific Fields --- */}
              {editingItem.type === 'part' && (
                <>
                  {/* ... Part Name and Die selectors stay the same ... */}

                  <div className="space-y-2">
                    <Label>Result</Label>
                    <Select
                      value={editingItem.data.result}
                      onValueChange={(v) => {
                        setEditingItem({
                          ...editingItem,
                          data: {
                            ...editingItem.data,
                            result: v,
                            // Clear NG reasons if changed to PASS
                            defectCategory: v === 'PASS' ? undefined : editingItem.data.defectCategory,
                            defectSubcategory: v === 'PASS' ? undefined : editingItem.data.defectSubcategory
                          }
                        })
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PASS">PASS</SelectItem>
                        <SelectItem value="NOT GOOD">NOT GOOD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* NEW: Conditional Defect Reason Fields */}
                  {editingItem.data.result === 'NOT GOOD' && (
                    <>
                      <div className="space-y-2">
                        <Label>Defect Category</Label>
                        <Select
                          value={editingItem.data.defectCategory}
                          onValueChange={(v) => setEditingItem({
                            ...editingItem,
                            data: { ...editingItem.data, defectCategory: v, defectSubcategory: '' }
                          })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                          <SelectContent>
                            {[...new Set(defectReasons.map(r => r.category))].map(cat => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Defect Subcategory</Label>
                        <Select
                          value={editingItem.data.defectSubcategory}
                          onValueChange={(v) => setEditingItem({
                            ...editingItem,
                            data: { ...editingItem.data, defectSubcategory: v }
                          })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select subcategory..." /></SelectTrigger>
                          <SelectContent>
                            {defectReasons
                              .filter(r => r.category === editingItem.data.defectCategory)
                              .map(reason => (
                                <SelectItem key={reason.id} value={reason.subcategory}>
                                  {reason.subcategory}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* --- Downtime Specific Fields --- */}
              {editingItem.type === 'downtime' && (
                <>
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Input
                      type="time"
                      value={editingItem.data.startTime}
                      onChange={(e) => setEditingItem({ ...editingItem, data: { ...editingItem.data, startTime: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <Input
                      type="time"
                      value={editingItem.data.endTime}
                      onChange={(e) => setEditingItem({ ...editingItem, data: { ...editingItem.data, endTime: e.target.value } })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duration (min)</Label>
                    <Input
                      type="number"
                      value={editingItem.data.duration}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        data: { ...editingItem.data, duration: parseInt(e.target.value) || 0 }
                      })}
                    />
                  </div>
                </>
              )}

              <div className="col-span-2 space-y-2">
                <Label>Comment</Label>
                <Input
                  value={editingItem.data.comment || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, data: { ...editingItem.data, comment: e.target.value } })}
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} className="bg-blue-600 hover:bg-blue-700">Apply All Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

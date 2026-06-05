export interface Operator {
  id: string;
  name: string;
  employeeId: string;
  role: string;
  active: boolean;
}

export interface Die {
  id: string;
  name: string;
  dieNumber: string;
}

export interface Part {
  id: string;
  name: string;
  partNumber: string;
  cycleTime: number; // in minutes
  image?: string;
  dies: Die[];
  active: boolean;
}

export interface Machine {
  id: string;
  name: string;
  machineId: string;
  type: 'casting' | 'machining';
  idealCycleTime: number; // in minutes (deprecated, use part cycle time)
  defaultShiftTime: number; // in minutes - default planned production time
  status: 'running' | 'idle' | 'maintenance' | 'breakdown';
  supportedParts: string[]; // Array of Part IDs
  image?: string;
  active: boolean;
}

export interface DefectEntry {
  category: 'casting' | 'machining';
  type: string;
  location?: string;
  quantity: number;
}

export interface DowntimeReasonPath {
  category: string;
  subsystem?: string;
  component?: string;
  specificItem?: string;
  fullPath: string;
}

export interface DefectReason {
  id: string;
  category: string;
  subcategory: string;
  specificReason: string;
  machineTypes?: ('casting' | 'machining')[]; // Filter by machine type
  machineIds?: string[]; // Filter by specific machines
  partIds?: string[]; // Filter by specific parts
  active: boolean;
}

export interface DowntimeReasonItem {
  id: string;
  level: 1 | 2 | 3 | 4;
  parentId?: string;
  name: string;
  requiresExtraField?: boolean;
  extraFieldLabel?: string;
  machineTypes?: ('casting' | 'machining')[];
  machineIds?: string[];
  active: boolean;
}

export interface ProcessReason {
  id: string;
  name: string;
  description?: string;
  machineTypes?: ('casting' | 'machining')[];
  machineIds?: string[];
  partIds?: string[];
  active: boolean;
}

export interface ScheduledDowntime {
  id: string;
  machineId: string;
  machineName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number; // in minutes, auto-calculated
  reason: string;
  comment?: string;
}

export interface PartProductionHistory {
  id: string;
  machineId: string;
  machineName: string;
  partId?: string;
  partName: string;
  die?: string;
  operatorId?: string;
  operatorName: string;
  date: string;
  shift: 'morning' | 'afternoon' | 'night';
  result: 'PASS' | 'NOT GOOD';
  defectCategory?: string;
  defectSubcategory?: string;
  defectSpecificReason?: string;
  comment?: string;
  timestamp: number;
}

export interface DowntimeEventHistory {
  id: string;
  machineId: string;
  machineName: string;
  operatorName: string;
  date: string;
  shift: 'morning' | 'afternoon' | 'night';
  startTime: string;
  endTime: string;
  duration: number;
  reason: DowntimeReasonPath;
  comment?: string;
  timestamp: number;
}

export interface DowntimeEvent {
  id: string;
  startTime: string;
  endTime: string;
  duration: number; // in minutes, auto-calculated
  reason: DowntimeReasonPath; // Multi-level hierarchical reason
  reasonCode?: string; // legacy support
  reasonLabel?: string; // legacy support
}

export interface ProductionRecord {
  id: string;
  machineId: string;
  machineName: string;
  date: string;
  shift: 'morning' | 'afternoon' | 'night';
  plannedProductionTime: number; // in minutes
  counterStart: number;
  counterEnd: number;
  grossCount: number; // raw counter reading (counterEnd - counterStart)
  excludedShots: number; // warm-up, test, trial shots to exclude
  netProduction: number; // auto-calculated: grossCount - excludedShots
  totalCount: number; // legacy support, same as netProduction
  targetOutput: number; // auto-calculated from cycle time
  performance: number; // auto-calculated: actualOutput / targetOutput
  downtime: number; // in minutes, sum of all downtime events
  downtimeEvents?: DowntimeEvent[];
  downtimeReason?: DowntimeReason; // legacy support
  goodCount: number; // auto-calculated: netProduction - defectCount
  defectCount: number;
  defects?: DefectEntry[];
  operatorName: string;
  notes?: string;
  timestamp: number;
}

export interface OEEMetrics {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
}

export interface DowntimeReason {
  category: string;
  subcategory: string;
  description?: string;
}

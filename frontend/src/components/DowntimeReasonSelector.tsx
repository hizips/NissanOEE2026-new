import { useState, useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, List, PenLine } from 'lucide-react';
import type { DowntimeReasonItem } from '@/types';

export interface DowntimeReasonPath {
  category: string;
  subsystem?: string;
  component?: string;
  specificItem?: string;
  fullPath: string;
}

interface DowntimeReasonSelectorProps {
  value: DowntimeReasonPath | null;
  onChange: (path: DowntimeReasonPath) => void;
  downtimeReasons: DowntimeReasonItem[];
  machineId?: string;
  machineType?: string;
}

const LEVEL_BADGES = [
  { label: 'Level 1', className: 'bg-blue-600 text-white' },
  { label: 'Level 2', className: 'bg-purple-600 text-white' },
  { label: 'Level 3', className: 'bg-orange-600 text-white' },
  { label: 'Level 4', className: 'bg-green-600 text-white' },
];

const LEVEL_LABELS = ['Category', 'Subsystem', 'Component', 'Specific Item'];
const LEVEL_INDENT = ['', 'ml-6', 'ml-12', 'ml-16'];
const LEVEL_BORDER = [
  'border-blue-300',
  'border-purple-300',
  'border-orange-300',
  'border-green-300',
];

function matchesMachineFilter(
  reason: DowntimeReasonItem,
  machineId?: string,
  machineType?: string,
): boolean {
  if (reason.machineIds?.length) {
    if (!machineId || !reason.machineIds.includes(machineId)) return false;
  }
  if (reason.machineTypes?.length) {
    if (!machineType || !reason.machineTypes.includes(machineType as 'casting' | 'machining')) {
      return false;
    }
  }
  return true;
}

function buildPathFromNames(names: string[]): DowntimeReasonPath {
  const fullPath = names.join(' → ');
  return {
    category: names[0] || '',
    subsystem: names[1],
    component: names[2],
    specificItem: names[3],
    fullPath,
  };
}

function findPredefinedSelection(
  value: DowntimeReasonPath | null,
  reasons: DowntimeReasonItem[],
): string[] {
  if (!value?.fullPath) return [];

  const activeReasons = reasons.filter(r => r.active);
  const parts = value.fullPath.split(' → ').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return [];

  const selectedIds: string[] = [];
  let parentId: string | undefined;

  for (const part of parts) {
    const match = activeReasons.find(r => {
      if (parentId) return r.parentId === parentId && r.name === part;
      return r.level === 1 && r.name === part;
    });
    if (!match) return [];
    selectedIds.push(match.id);
    parentId = match.id;
  }

  return selectedIds;
}

export function DowntimeReasonSelector({
  value,
  onChange,
  downtimeReasons,
  machineId,
  machineType,
}: DowntimeReasonSelectorProps) {
  const filteredReasons = useMemo(
    () =>
      downtimeReasons.filter(
        r => r.active && matchesMachineFilter(r, machineId, machineType),
      ),
    [downtimeReasons, machineId, machineType],
  );

  const [mode, setMode] = useState<'predefined' | 'manual'>(() => {
    if (!value?.fullPath) return 'predefined';
    return findPredefinedSelection(value, downtimeReasons).length > 0
      ? 'predefined'
      : 'manual';
  });
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    findPredefinedSelection(value, downtimeReasons),
  );
  const [manualText, setManualText] = useState(() => {
    if (!value?.fullPath) return '';
    return findPredefinedSelection(value, downtimeReasons).length > 0
      ? ''
      : value.fullPath;
  });

  useEffect(() => {
    if (!value?.fullPath) {
      setSelectedIds([]);
      setManualText('');
      return;
    }

    const predefinedIds = findPredefinedSelection(value, downtimeReasons);
    if (predefinedIds.length > 0) {
      setMode('predefined');
      setSelectedIds(predefinedIds);
      setManualText('');
    } else {
      setMode('manual');
      setSelectedIds([]);
      setManualText(value.fullPath);
    }
  }, [value?.fullPath, downtimeReasons]);

  const getChildren = (parentId?: string) =>
    filteredReasons.filter(r =>
      parentId ? r.parentId === parentId : r.level === 1,
    );

  const emitPredefinedPath = (ids: string[]) => {
    const names = ids
      .map(id => filteredReasons.find(r => r.id === id)?.name)
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) {
      onChange(buildPathFromNames(names));
    }
  };

  const handleModeChange = (nextMode: 'predefined' | 'manual') => {
    setMode(nextMode);
    if (nextMode === 'predefined') {
      setManualText('');
      if (selectedIds.length > 0) {
        emitPredefinedPath(selectedIds);
      }
    } else {
      setSelectedIds([]);
      if (manualText.trim()) {
        onChange(buildPathFromNames([manualText.trim()]));
      }
    }
  };

  const handleLevelChange = (levelIndex: number, reasonId: string) => {
    const nextIds = [...selectedIds.slice(0, levelIndex), reasonId];
    setSelectedIds(nextIds);
    emitPredefinedPath(nextIds);
  };

  const handleManualChange = (text: string) => {
    setManualText(text);
    const trimmed = text.trim();
    if (trimmed) {
      onChange(buildPathFromNames([trimmed]));
    }
  };

  const selectedNames = selectedIds
    .map(id => filteredReasons.find(r => r.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  const levelOptions: DowntimeReasonItem[][] = [];
  let parentId: string | undefined;
  for (let level = 0; level < 4; level++) {
    const options = getChildren(parentId);
    if (options.length === 0) break;
    levelOptions.push(options);
    if (selectedIds[level]) {
      parentId = selectedIds[level];
    } else {
      break;
    }
  }

  return (
    <div className="space-y-4">
      <div className="mb-3 bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
        <Label className="text-base font-semibold mb-3 block text-blue-900">
          Downtime Reason
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant={mode === 'predefined' ? 'default' : 'outline'}
            className={`h-12 text-base font-semibold ${
              mode === 'predefined'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'border-2 border-blue-300'
            }`}
            onClick={() => handleModeChange('predefined')}
          >
            <List className="h-5 w-5 mr-2" />
            Select from list
          </Button>
          <Button
            type="button"
            variant={mode === 'manual' ? 'default' : 'outline'}
            className={`h-12 text-base font-semibold ${
              mode === 'manual'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'border-2 border-blue-300'
            }`}
            onClick={() => handleModeChange('manual')}
          >
            <PenLine className="h-5 w-5 mr-2" />
            Enter manually
          </Button>
        </div>
      </div>

      {mode === 'predefined' ? (
        filteredReasons.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-slate-600">
            No predefined downtime reasons are configured. Use manual entry or ask a
            manager to add reasons.
          </div>
        ) : (
          <>
            {levelOptions.map((options, levelIndex) => (
              <div key={levelIndex} className={LEVEL_INDENT[levelIndex]}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={LEVEL_BADGES[levelIndex].className}>
                    {LEVEL_BADGES[levelIndex].label}
                  </Badge>
                  <Label className="font-semibold">{LEVEL_LABELS[levelIndex]}</Label>
                </div>
                <Select
                  value={selectedIds[levelIndex] || ''}
                  onValueChange={(val) => handleLevelChange(levelIndex, val)}
                >
                  <SelectTrigger
                    className={`h-14 text-lg border-2 ${LEVEL_BORDER[levelIndex]}`}
                  >
                    <SelectValue placeholder={`Select ${LEVEL_LABELS[levelIndex].toLowerCase()}...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map(option => (
                      <SelectItem key={option.id} value={option.id} className="text-base py-3">
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}

            {selectedNames.length > 0 && (
              <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-400">
                <div className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                  <Badge className="bg-green-600 text-white">Selected Path</Badge>
                </div>
                <div className="flex items-center gap-2 text-base font-bold text-green-900 flex-wrap">
                  {selectedNames.map((name, index) => (
                    <span key={`${name}-${index}`} className="flex items-center gap-2">
                      {index > 0 && <ChevronRight className="h-5 w-5 text-green-600" />}
                      <span
                        className={`bg-white px-3 py-2 rounded border-2 ${LEVEL_BORDER[index] || 'border-green-300'}`}
                      >
                        {name}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      ) : (
        <div>
          <Label htmlFor="manual-downtime-reason" className="font-semibold mb-2 block">
            Reason description
          </Label>
          <Input
            id="manual-downtime-reason"
            value={manualText}
            onChange={(e) => handleManualChange(e.target.value)}
            placeholder="Describe the downtime reason..."
            className="h-14 text-lg border-2 border-blue-300"
          />
        </div>
      )}
    </div>
  );
}

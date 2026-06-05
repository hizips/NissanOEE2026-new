import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';

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
}

// Hierarchical downtime reason structure
const downtimeHierarchy = {
  'Machine': {
    'Die': {
      'Core Pin': ['Pin #1', 'Pin #2', 'Pin #3', 'Pin #4', 'Pin #5'],
      'Insert': ['Insert A', 'Insert B', 'Insert C'],
      'Ejector': ['Ejector Pin #1', 'Ejector Pin #2', 'Ejector System'],
      'Cavity': ['Cavity 1', 'Cavity 2', 'Cavity 3', 'Cavity 4'],
    },
    'Core': {
      'Core Pin': ['Core #1', 'Core #2', 'Core #3'],
      'Sleeve': ['Sleeve Front', 'Sleeve Rear'],
      'Guide': ['Guide Pin 1', 'Guide Pin 2'],
    },
    'Cooling': {
      'Water Line': ['Line #1', 'Line #2', 'Line #3', 'Line #4'],
      'Fitting': ['Fitting A', 'Fitting B', 'Fitting C'],
      'Valve': ['Inlet Valve', 'Outlet Valve', 'Control Valve'],
    },
    'Conveyor': {
      'Belt': ['Main Belt', 'Transfer Belt'],
      'Motor': ['Drive Motor', 'Servo Motor'],
      'Sensor': ['Entry Sensor', 'Exit Sensor', 'Position Sensor'],
    },
    'Hydraulic': {
      'Pump': ['Main Pump', 'Auxiliary Pump'],
      'Cylinder': ['Clamp Cylinder', 'Ejector Cylinder'],
      'Valve': ['Pressure Valve', 'Flow Valve', 'Relief Valve'],
    },
  },
  'Tooling': {
    'Die Change': {
      'Replace Die': ['Complete replacement', 'Scheduled change'],
    },
    'Die Set': {
      'Wear': ['Excessive wear', 'Surface damage', 'Misalignment'],
      'Breakage': ['Crack', 'Chip', 'Complete break'],
      'Maintenance': ['Scheduled maintenance', 'Cleaning required'],
    },
    'Insert': {
      'Replacement': ['Normal wear', 'Emergency replacement'],
      'Adjustment': ['Height adjustment', 'Position adjustment'],
    },
  },
  'Material': {
    'Raw Material': {
      'Shortage': ['Stock depleted', 'Delivery delayed'],
      'Quality Issue': ['Contamination', 'Wrong specification', 'Moisture content'],
    },
    'Consumables': {
      'Release Agent': ['Empty', 'Low level'],
      'Lubricant': ['Empty', 'Wrong type'],
    },
  },
  'Process': {
    'Quality': {
      'First Article': ['Initial setup verification'],
      'Adjustment': ['Temperature adjustment', 'Pressure adjustment', 'Time adjustment'],
      'Inspection': ['Dimensional check', 'Visual inspection'],
    },
    'Setup': {
      'Changeover': ['Die change', 'Material change'],
      'Calibration': ['Sensor calibration', 'Pressure calibration'],
    },
  },
  'Other': {
    'Planned': {
      'Meeting': ['Shift meeting', 'Safety briefing'],
      'Break': ['Scheduled break', 'Lunch break'],
    },
    'Administrative': {
      'Documentation': ['Paperwork', 'Data entry'],
      'Training': ['Operator training', 'Safety training'],
    },
  },
};

export function DowntimeReasonSelector({ value, onChange }: DowntimeReasonSelectorProps) {
  const [category, setCategory] = useState<string>(value?.category || '');
  const [subsystem, setSubsystem] = useState<string>(value?.subsystem || '');
  const [component, setComponent] = useState<string>(value?.component || '');
  const [specificItem, setSpecificItem] = useState<string>(value?.specificItem || '');

  // Update path whenever any level changes (flexible selection)
  useEffect(() => {
    if (category) {
      // Build path dynamically based on selected levels
      const pathParts = [category];
      if (subsystem) pathParts.push(subsystem);
      if (component) pathParts.push(component);
      if (specificItem) pathParts.push(specificItem);

      const fullPath = pathParts.join(' → ');

      onChange({
        category,
        subsystem: subsystem || undefined,
        component: component || undefined,
        specificItem: specificItem || undefined,
        fullPath,
      });
    }
  }, [category, subsystem, component, specificItem, onChange]);

  const categories = Object.keys(downtimeHierarchy);
  const subsystems = category ? Object.keys(downtimeHierarchy[category as keyof typeof downtimeHierarchy] || {}) : [];
  const components = category && subsystem
    ? Object.keys((downtimeHierarchy[category as keyof typeof downtimeHierarchy] as any)?.[subsystem] || {})
    : [];
  const specificItems = category && subsystem && component
    ? ((downtimeHierarchy[category as keyof typeof downtimeHierarchy] as any)?.[subsystem]?.[component] || [])
    : [];

  return (
    <div className="space-y-1">
      <div className="mb-3 bg-blue-50 border-2 border-blue-300 rounded-lg p-4">
        <Label className="text-base font-semibold mb-2 block text-blue-900">Downtime Reason </Label>
      </div>

      {/* Level 1: Category */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge className="bg-blue-600 text-white">Level 1</Badge>
          <Label className="font-semibold">Category</Label>
        </div>
        <Select
          value={category}
          onValueChange={(val) => {
            setCategory(val);
            setSubsystem('');
            setComponent('');
            setSpecificItem('');
          }}
        >
          <SelectTrigger className="h-14 text-lg border-2 border-blue-300">
            <SelectValue placeholder="Select category..." />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat} className="text-base py-3">
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Level 2: Subsystem */}
      {category && (
        <div className="ml-6">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-purple-600 text-white">Level 2</Badge>
            <Label className="font-semibold">Subsystem</Label>
          </div>
          <Select
            value={subsystem}
            onValueChange={(val) => {
              setSubsystem(val);
              setComponent('');
              setSpecificItem('');
            }}
          >
            <SelectTrigger className="h-14 text-lg border-2 border-purple-300">
              <SelectValue placeholder="Select subsystem..." />
            </SelectTrigger>
            <SelectContent>
              {subsystems.map((sub) => (
                <SelectItem key={sub} value={sub} className="text-base py-3">
                  {sub}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Level 3: Component */}
      {category && subsystem && (
        <div className="ml-12">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-orange-600 text-white">Level 3</Badge>
            <Label className="font-semibold">Component</Label>
          </div>
          <Select
            value={component}
            onValueChange={(val) => {
              setComponent(val);
              setSpecificItem('');
            }}
          >
            <SelectTrigger className="h-14 text-lg border-2 border-orange-300">
              <SelectValue placeholder="Select component..." />
            </SelectTrigger>
            <SelectContent>
              {components.map((comp) => (
                <SelectItem key={comp} value={comp} className="text-base py-3">
                  {comp}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Level 4: Specific Item */}
      {category && subsystem && component && (
        <div className="ml-18">
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-green-600 text-white">Level 4</Badge>
            <Label className="font-semibold">Specific Item</Label>
          </div>
          <Select
            value={specificItem}
            onValueChange={setSpecificItem}
          >
            <SelectTrigger className="h-14 text-lg border-2 border-green-300">
              <SelectValue placeholder="Select specific item..." />
            </SelectTrigger>
            <SelectContent>
              {specificItems.map((item: string) => (
                <SelectItem key={item} value={item} className="text-base py-3">
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Full Path Display - Shows at any level */}
      {category && (
        <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-2 border-green-400 animate-in fade-in slide-in-from-top-2">
          <div className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
            <Badge className="bg-green-600 text-white">Selected Path</Badge>
          </div>
          <div className="flex items-center gap-2 text-base font-bold text-green-900 flex-wrap">
            <span className="bg-white px-3 py-2 rounded border-2 border-blue-300">{category}</span>
            {subsystem && (
              <>
                <ChevronRight className="h-5 w-5 text-green-600" />
                <span className="bg-white px-3 py-2 rounded border-2 border-purple-300">{subsystem}</span>
              </>
            )}
            {component && (
              <>
                <ChevronRight className="h-5 w-5 text-green-600" />
                <span className="bg-white px-3 py-2 rounded border-2 border-orange-300">{component}</span>
              </>
            )}
            {specificItem && (
              <>
                <ChevronRight className="h-5 w-5 text-green-600" />
                <span className="bg-white px-3 py-2 rounded border-2 border-green-300">{specificItem}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

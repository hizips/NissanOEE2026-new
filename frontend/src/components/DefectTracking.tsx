import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertTriangle,
  Minus,
  Plus,
  XCircle,
  Wrench,
  Zap,
} from 'lucide-react';
import type { DefectEntry } from '@/types';

interface DefectTrackingProps {
  defects: DefectEntry[];
  onDefectsChange: (defects: DefectEntry[]) => void;
  totalParts: number;
}

// Comprehensive defect definitions based on real casting factory paper forms
const CASTING_DEFECTS = [
  { type: 'Crack', icon: '🔴' },
  { type: 'Porosity', icon: '🔵' },
  { type: 'Cold shut', icon: '❄️' },
  { type: 'Gate break', icon: '🔨' },
  { type: 'Inclusion', icon: '⚫' },
  { type: 'Chipping', icon: '💥' },
  { type: 'Laser mark defects', icon: '⚡' },
  { type: 'Others', icon: '❓' },
];

const MACHINING_DEFECTS = [
  { type: 'Dimensional', icon: '📏' },
  { type: 'Handling', icon: '🤲' },
  { type: 'Misload', icon: '⚠️' },
  { type: 'Tool breakage', icon: '🔧' },
  { type: 'Chatter', icon: '〰️' },
  { type: 'Double Machine', icon: '2️⃣' },
  { type: 'Swarf Damage', icon: '⚙️' },
  { type: 'Others', icon: '❓' },
];

const DEFECT_LOCATIONS = [
  'Pan seal FIPG Face',
  'Cover seal FIPG Face',
  'UVW Cover gasket face',
  'LV Connector Seal',
  'UVW Connector face',
  'PN Connector face',
  'A/C Connector seal face',
  'Motor Mounting Bosses',
  'Bolt Flanges (Upper)',
  'Bolt Flanges (Lower)',
  'Thread holes',
  'PM Face',
];

export function DefectTracking({ defects, onDefectsChange, totalParts }: DefectTrackingProps) {
  const [selectedCategory, setSelectedCategory] = useState<'casting' | 'machining'>('casting');
  const [showLocationSelect, setShowLocationSelect] = useState<string | null>(null);

  const getDefectQuantity = (category: 'casting' | 'machining', type: string): number => {
    const defect = defects.find(d => d.category === category && d.type === type);
    return defect?.quantity || 0;
  };

  const updateDefectQuantity = (category: 'casting' | 'machining', type: string, delta: number) => {
    const currentQuantity = getDefectQuantity(category, type);
    const newQuantity = Math.max(0, Math.min(totalParts, currentQuantity + delta));

    if (newQuantity === 0) {
      // Remove defect entry
      onDefectsChange(defects.filter(d => !(d.category === category && d.type === type)));
    } else {
      const existingDefect = defects.find(d => d.category === category && d.type === type);
      if (existingDefect) {
        // Update existing
        onDefectsChange(defects.map(d =>
          d.category === category && d.type === type
            ? { ...d, quantity: newQuantity }
            : d
        ));
      } else {
        // Add new
        onDefectsChange([...defects, { category, type, quantity: newQuantity }]);
      }
    }
  };

  const setDefectLocation = (category: 'casting' | 'machining', type: string, location: string) => {
    onDefectsChange(defects.map(d =>
      d.category === category && d.type === type
        ? { ...d, location }
        : d
    ));
    setShowLocationSelect(null);
  };

  const totalDefects = defects.reduce((sum, d) => sum + d.quantity, 0);
  const remainingCapacity = totalParts - totalDefects;
  const defectsByCategory = selectedCategory === 'casting' ? CASTING_DEFECTS : MACHINING_DEFECTS;

  return (
    <TooltipProvider>
      <div className="bg-gradient-to-r from-red-50 to-orange-50 p-6 rounded-xl border-2 border-red-300">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-600" />
            Defect Recording
          </h3>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-sm text-slate-600">Total Defects</div>
              <div className={`text-3xl font-bold ${totalDefects > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {totalDefects}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-600">Remaining Capacity</div>
              <div className={`text-3xl font-bold ${remainingCapacity > 0 ? 'text-slate-600' : 'text-amber-600'}`}>
                {remainingCapacity}
              </div>
            </div>
          </div>
        </div>

        {/* Category Selection */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={() => setSelectedCategory('casting')}
                className={`h-20 text-xl font-bold transition-all ${
                  selectedCategory === 'casting'
                    ? 'bg-red-600 hover:bg-red-700 text-white scale-105 shadow-lg'
                    : 'bg-white hover:bg-red-50 text-slate-700 border-2 border-red-200'
                }`}
              >
                <Zap className="h-6 w-6 mr-2" />
                Casting Defects
                {defects.filter(d => d.category === 'casting').length > 0 && (
                  <Badge className="ml-2 bg-white text-red-600">
                    {defects.filter(d => d.category === 'casting').reduce((sum, d) => sum + d.quantity, 0)}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Defects from the casting process</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                onClick={() => setSelectedCategory('machining')}
                className={`h-20 text-xl font-bold transition-all ${
                  selectedCategory === 'machining'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white scale-105 shadow-lg'
                    : 'bg-white hover:bg-orange-50 text-slate-700 border-2 border-orange-200'
                }`}
              >
                <Wrench className="h-6 w-6 mr-2" />
                Machining Defects
                {defects.filter(d => d.category === 'machining').length > 0 && (
                  <Badge className="ml-2 bg-white text-orange-600">
                    {defects.filter(d => d.category === 'machining').reduce((sum, d) => sum + d.quantity, 0)}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Defects from the machining process</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Defect Type Cards */}
        <div className="space-y-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">
            Select defect types (mouse-only, no typing required):
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {defectsByCategory.map(({ type, icon }) => {
              const quantity = getDefectQuantity(selectedCategory, type);
              const isActive = quantity > 0;
              const defectEntry = defects.find(d => d.category === selectedCategory && d.type === type);

              return (
                <div key={type} className="space-y-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Card
                        className={`cursor-pointer transition-all duration-200 ${
                          isActive
                            ? 'border-4 border-red-500 bg-red-100 shadow-lg scale-105'
                            : 'border-2 border-slate-300 bg-white hover:border-red-300 hover:bg-red-50'
                        }`}
                      >
                        <CardContent className="p-4">
                          <div className="text-center space-y-2">
                            <div className="text-4xl">{icon}</div>
                            <div className="font-semibold text-sm leading-tight">{type}</div>
                            {isActive && (
                              <div className="text-2xl font-bold text-red-600">{quantity}</div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{type} - Click +/- to adjust quantity</p>
                    </TooltipContent>
                  </Tooltip>

                  {/* Quantity Controls - GLOVE-FRIENDLY LARGE BUTTONS */}
                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateDefectQuantity(selectedCategory, type, -1)}
                          disabled={quantity === 0}
                          className="flex-1 h-16 text-2xl font-bold hover:bg-blue-50 border-2"
                        >
                          <Minus className="h-7 w-7" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Decrease by 1</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => updateDefectQuantity(selectedCategory, type, 1)}
                          disabled={totalDefects >= totalParts}
                          className="flex-1 h-16 text-2xl font-bold hover:bg-green-50 border-2"
                        >
                          <Plus className="h-7 w-7" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Increase by 1</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Quick Add Buttons - ALWAYS SHOW FOR GLOVE USERS */}
                  <div className="flex gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          onClick={() => updateDefectQuantity(selectedCategory, type, 5)}
                          disabled={totalDefects >= totalParts}
                          className="flex-1 h-12 text-base font-bold bg-blue-600 hover:bg-blue-700"
                        >
                          +5
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Quick add 5 defects</p>
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          onClick={() => updateDefectQuantity(selectedCategory, type, 10)}
                          disabled={totalDefects >= totalParts}
                          className="flex-1 h-12 text-base font-bold bg-blue-600 hover:bg-blue-700"
                        >
                          +10
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Quick add 10 defects</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {/* Location Selection (for casting defects only) */}
                  {isActive && selectedCategory === 'casting' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setShowLocationSelect(showLocationSelect === type ? null : type)}
                      className="w-full h-8 text-xs"
                    >
                      {defectEntry?.location || 'Set Location'}
                    </Button>
                  )}

                  {/* Location Dropdown */}
                  {showLocationSelect === type && selectedCategory === 'casting' && (
                    <div className="absolute z-10 mt-1 w-64 bg-white border-2 border-red-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                      {DEFECT_LOCATIONS.map(location => (
                        <button
                          key={location}
                          type="button"
                          onClick={() => setDefectLocation(selectedCategory, type, location)}
                          className="w-full text-left px-3 py-2 hover:bg-red-50 text-sm border-b last:border-b-0"
                        >
                          {location}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Defects Summary */}
        {totalDefects > 0 && (
          <div className="mt-6 bg-white p-4 rounded-lg border-2 border-red-400">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-base">Active Defects Summary</h4>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => onDefectsChange([])}
                    className="gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    Clear All
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Remove all defect entries</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="space-y-2">
              {defects.map((defect, index) => (
                <div key={index} className="flex items-center justify-between bg-slate-50 p-3 rounded">
                  <div className="flex items-center gap-3">
                    <Badge className={defect.category === 'casting' ? 'bg-red-600' : 'bg-orange-600'}>
                      {defect.category.toUpperCase()}
                    </Badge>
                    <span className="font-semibold">{defect.type}</span>
                    {defect.location && (
                      <span className="text-sm text-slate-600">@ {defect.location}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-bold text-red-600">{defect.quantity}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => updateDefectQuantity(defect.category, defect.type, -defect.quantity)}
                      className="h-8 w-8 p-0"
                    >
                      <XCircle className="h-5 w-5 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Guidelines */}
        <div className="mt-4 p-3 bg-white rounded-lg border border-red-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-slate-700 space-y-1">
              <p>
                <strong className="text-red-700">Glove-friendly design:</strong> No typing required. Click category → Use +/- buttons to set quantity → Optionally select location for casting defects.
              </p>
              <p>
                <strong className="text-red-700">Auto-calculation:</strong> Total defects = {totalDefects}, Good parts will be auto-calculated as {totalParts - totalDefects}. Cannot exceed total parts ({totalParts}).
              </p>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

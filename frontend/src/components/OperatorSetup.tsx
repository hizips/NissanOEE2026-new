import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Machine, Operator, Part } from '@/types';
import { ClipboardList, User, Calendar, Factory, Package, Clock, PlayCircle, Info } from 'lucide-react';
import { format } from 'date-fns';
import { MachineSelector } from '@/components/MachineSelector';
import { PartSelector } from './PartSelector';
import { toast } from 'sonner';

export interface OperatorSetupData {
  operatorName: string;
  date: string;
  machineId: string;
  machineName: string;
  partId?: string;
  partName: string;
  shift: 'morning' | 'afternoon' | 'night';
  die?: string;
  counterStart?: number;
}

interface OperatorSetupProps {
  machines: Machine[];
  operators: Operator[];
  parts: Part[];
  onStartWork: (setupData: OperatorSetupData) => void;
  existingSetup?: OperatorSetupData;
  mode?: 'new' | 'edit' | 'partcast-change';
}


export function OperatorSetup({ machines, operators, parts, onStartWork, existingSetup, mode = 'new' }: OperatorSetupProps) {
  const [operatorName, setOperatorName] = useState<string>(existingSetup?.operatorName || '');
  const [date, setDate] = useState<string>(existingSetup?.date || format(new Date(), 'yyyy-MM-dd'));
  const [machineCategory, setMachineCategory] = useState<'casting' | 'machining'>('casting');
  const [selectedMachineId, setSelectedMachineId] = useState<string>(existingSetup?.machineId || '');
  const [partName, setPartName] = useState<string>(existingSetup?.partName || '');
  const [shift, setShift] = useState<'morning' | 'afternoon' | 'night'>(existingSetup?.shift || 'morning');
  const [die, setDie] = useState<string>(existingSetup?.die || '');
  const [counterStart, setCounterStart] = useState<string>(existingSetup?.counterStart?.toString() || '');

  const selectedMachine = machines.find(m => m.id === selectedMachineId);

  // Filter machines by category using the machine type field
  const filteredMachines = machines.filter(m => m.type === machineCategory);

  // Filter parts based on the selected machine's supported parts
  const availableParts = selectedMachine
    ? parts.filter(p => p.active && selectedMachine.supportedParts?.includes(p.id))
    : [];

  // Get the selected part object
  const selectedPart = parts.find(p => p.name === partName);

  const isDieCastMachine = selectedMachine?.type === 'casting';

  // Auto-detect shift based on current time
  useEffect(() => {
    const hour = new Date().getHours();
    let detectedShift: 'morning' | 'afternoon' | 'night' = 'morning';
    if (hour >= 6 && hour < 14) detectedShift = 'morning';
    else if (hour >= 14 && hour < 22) detectedShift = 'afternoon';
    else detectedShift = 'night';
    setShift(detectedShift);
  }, []);

  // Reset die selection when part changes
  useEffect(() => {
    if (!existingSetup) {
      setDie('');
    }
  }, [partName, existingSetup]);

  // Reset part and die when machine changes
  useEffect(() => {
    if (!existingSetup && selectedMachineId) {
      const currentPartStillAvailable = availableParts.some(p => p.name === partName);
      if (!currentPartStillAvailable) {
        setPartName('');
        setDie('');
      }
    }
  }, [selectedMachineId, existingSetup]);

  const handleStartWork = () => {
    if (!operatorName) {
      toast.error('Please select your name');
      return;
    }
    if (!selectedMachineId) {
      toast.error('Please select a machine');
      return;
    }
    if (!partName) {
      toast.error('Please select a part');
      return;
    }
    if (isDieCastMachine && selectedPart && selectedPart.dies.length > 0 && !die) {
      toast.error('Please select a die for this casting machine');
      return;
    }

    const setupData: OperatorSetupData = {
      operatorName,
      date,
      machineId: selectedMachineId,
      machineName: selectedMachine!.name,
      partId: selectedPart?.id,
      partName,
      shift,
      die: isDieCastMachine && selectedPart?.dies.length ? die : undefined,
      counterStart: counterStart ? parseInt(counterStart) : 0,
    };

    onStartWork(setupData);
  };

  const getCurrentShift = (): { name: string; color: string } => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return { name: 'Morning Shift', color: 'bg-blue-500' };
    if (hour >= 14 && hour < 22) return { name: 'Afternoon Shift', color: 'bg-amber-500' };
    return { name: 'Night Shift', color: 'bg-indigo-500' };
  };

  const currentShift = getCurrentShift();

  const getHeaderConfig = () => {
    switch (mode) {
      case 'edit':
        return {
          title: 'Edit Setup',
          description: 'Update your job configuration',
          color: 'from-blue-600 to-blue-700'
        };
      case 'partcast-change':
        return {
          title: 'Part / Die Change',
          description: 'Update part and die information',
          color: 'from-orange-600 to-orange-700'
        };
      default:
        return {
          title: 'Operator Setup',
          description: 'Configure your job before starting work',
          color: 'from-blue-600 to-blue-700'
        };
    }
  };

  const headerConfig = getHeaderConfig();
  const isPartCastChangeMode = mode === 'partcast-change';

  return (
    <div className="bg-white min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <Card className="border-2 shadow-2xl">
          <CardHeader className={`bg-gradient-to-r ${headerConfig.color} text-white`}>
            <div className="flex items-center gap-4">
              <div className="p-4 bg-white/20 rounded-lg backdrop-blur-sm">
                <ClipboardList className="h-10 w-10" />
              </div>
              <div>
                <CardTitle className="text-3xl font-bold">{headerConfig.title}</CardTitle>
                <CardDescription className={`${mode === 'partcast-change' ? 'text-orange-100' : 'text-blue-100'} text-lg`}>
                  {headerConfig.description}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-8 pb-12 px-8 space-y-12 overflow-visible">
            {/* Current Date & Shift */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <Label className="text-lg font-semibold flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  Date *
                  <Badge variant="outline" className="ml-auto bg-blue-100 text-blue-700">Auto Default</Badge>
                </Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  disabled={isPartCastChangeMode}
                  className={`h-16 px-4 text-xl font-bold border-4 [color-scheme:light] ${
                    isPartCastChangeMode 
                      ? 'border-slate-300 bg-slate-100 text-slate-500' 
                      : 'border-blue-300 bg-blue-50 text-blue-800 focus-visible:ring-blue-400'
                  }`}
                />
              </div>

              <div className="space-y-3">
                <Label className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Shift
                </Label>
                <div className="grid grid-cols-3 gap-3">
                  <Button
                    type="button"
                    onClick={() => setShift('morning')}
                    variant={shift === 'morning' ? 'default' : 'outline'}
                    className={`h-16 flex flex-col items-center justify-center gap-1 transition-all ${
                      shift === 'morning'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white border-4 border-blue-600'
                        : 'border-4 border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-bold text-base">Morning</span>
                    <span className="text-xs opacity-90">6AM–2PM</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setShift('afternoon')}
                    variant={shift === 'afternoon' ? 'default' : 'outline'}
                    className={`h-16 flex flex-col items-center justify-center gap-1 transition-all ${
                      shift === 'afternoon'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white border-4 border-blue-600'
                        : 'border-4 border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-bold text-base">Afternoon</span>
                    <span className="text-xs opacity-90">2PM–10PM</span>
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setShift('night')}
                    variant={shift === 'night' ? 'default' : 'outline'}
                    className={`h-16 flex flex-col items-center justify-center gap-1 transition-all ${
                      shift === 'night'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white border-4 border-blue-600'
                        : 'border-4 border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <span className="font-bold text-base">Night</span>
                    <span className="text-xs opacity-90">10PM–6AM</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Operator Name - Disabled in part/cast change mode */}
            <div className="space-y-3">
              <Label className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-blue-600" />
                Your Name *
                {isPartCastChangeMode && <Badge className="bg-slate-500 text-white">Locked</Badge>}
              </Label>
              <Select value={operatorName} onValueChange={setOperatorName} disabled={isPartCastChangeMode}>
                <SelectTrigger className={`h-20 text-2xl border-4 ${isPartCastChangeMode ? 'border-slate-300 bg-slate-100' : 'border-green-400 bg-white'} font-bold`}>
                  <SelectValue placeholder="Select your name" />
                </SelectTrigger>
                <SelectContent>
                  {operators.filter(op => op.active).map((operator) => (
                    <SelectItem key={operator.id} value={operator.name} className="text-xl py-3">
                      {operator.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Machine Selection - Disabled in part/cast change mode */}
            <div className="space-y-4">
              <Label className="text-lg font-semibold flex items-center gap-2">
                <Factory className="h-5 w-5 text-blue-600" />
                Machine *
                {isPartCastChangeMode && <Badge className="bg-slate-500 text-white">Locked</Badge>}
              </Label>

              {/* Machine Category Selector */}
              {!isPartCastChangeMode && (
                <div className="grid grid-cols-2 gap-4">
                  <Button
                    type="button"
                    onClick={() => {
                      setMachineCategory('casting');
                      setSelectedMachineId(''); // Reset machine selection
                      setPartName(''); // Reset part selection
                      setDie(''); // Reset die
                    }}
                    variant={machineCategory === 'casting' ? 'default' : 'outline'}
                    className={`h-16 text-xl font-bold transition-all ${
                      machineCategory === 'casting'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white border-4 border-blue-600'
                        : 'border-4 border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    Casting Machine
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setMachineCategory('machining');
                      setSelectedMachineId(''); // Reset machine selection
                      setPartName(''); // Reset part selection
                      setDie(''); // Reset die
                    }}
                    variant={machineCategory === 'machining' ? 'default' : 'outline'}
                    className={`h-16 text-xl font-bold transition-all ${
                      machineCategory === 'machining'
                        ? 'bg-blue-600 hover:bg-blue-700 text-white border-4 border-blue-600'
                        : 'border-4 border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    Machining Machine
                  </Button>
                </div>
              )}

              {/* Machine Cards */}
              {isPartCastChangeMode ? (
                <div className="h-20 px-6 border-4 border-slate-300 bg-slate-100 rounded-lg flex items-center">
                  <span className="text-2xl font-bold text-slate-600">
                    {machines.find(m => m.id === selectedMachineId)?.name || 'N/A'}
                  </span>
                </div>
              ) : (
                <MachineSelector
                  machines={filteredMachines}
                  selectedMachineId={selectedMachineId}
                  onSelectMachine={setSelectedMachineId}
                />
              )}
            </div>

            {/* Part Selection */}
            <div className="space-y-3">
              {selectedMachineId ? (
                <PartSelector
                  parts={availableParts.map(p => p.name)}
                  selectedPart={partName}
                  onSelectPart={setPartName}
                  cycleTime={selectedPart?.cycleTime}
                />
              ) : (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-6">
                  <div className="flex items-center gap-3">
                    <Package className="h-6 w-6 text-amber-600" />
                    <div>
                      <p className="font-semibold text-amber-800">Please select a machine first</p>
                      <p className="text-sm text-amber-700">Available parts will be filtered based on your machine selection</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Die Selection (conditional) - Only show if casting machine AND part selected */}
            {isDieCastMachine && partName && selectedPart && (
              <div className={`space-y-4 p-6 rounded-xl border-2 ${isPartCastChangeMode ? 'bg-orange-50 border-orange-300' : 'bg-amber-50 border-amber-300'}`}>
                <Label className="text-lg font-semibold flex items-center gap-2">
                  <Factory className="h-5 w-5 text-amber-600" />
                  Select Die * <Badge className="bg-amber-600 text-white">Casting Machine</Badge>
                  {isPartCastChangeMode && <Badge className="bg-orange-600 text-white ml-2">Editable</Badge>}
                </Label>
                {selectedPart.dies.length > 0 ? (
                  <div className="grid grid-cols-4 gap-3">
                    {selectedPart.dies.map((dieOption) => (
                      <Button
                        key={dieOption.id}
                        type="button"
                        onClick={() => setDie(dieOption.name)}
                        variant={die === dieOption.name ? 'default' : 'outline'}
                        className={`h-16 text-xl font-bold transition-all ${
                          die === dieOption.name
                            ? 'bg-amber-600 hover:bg-amber-700 text-white border-4 border-amber-600'
                            : 'border-4 border-slate-300 bg-white hover:bg-amber-50 text-slate-700'
                        }`}
                      >
                        {dieOption.name}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white border-2 border-amber-300 rounded-lg p-4">
                    <p className="text-sm text-amber-800">
                      No dies configured for this part. Please configure dies in the Part Management section.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Machine Counter Start - Show when part is selected */}
            {partName && (
              <div className="space-y-4 p-6 rounded-xl border-2 bg-blue-50 border-blue-300">
                <Label className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Machine Counter Reading *
                  <Badge className="bg-blue-600 text-white">Start of Shift</Badge>
                </Label>
                <p className="text-sm text-blue-800">
                  Enter the current counter number displayed on the machine before starting production.
                </p>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g., 12345"
                  value={counterStart}
                  onChange={(e) => setCounterStart(e.target.value)}
                  className="h-20 text-3xl font-bold text-center border-4 border-blue-400 bg-white"
                />
              </div>
            )}

            {/* Action Button */}
            <Button
              onClick={handleStartWork}
              className={`w-full h-24 text-3xl font-bold ${
                mode === 'partcast-change'
                  ? 'bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-700 hover:to-orange-800'
                  : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800'
              } text-white gap-4 shadow-xl`}
            >
              <PlayCircle className="h-10 w-10" />
              {mode === 'partcast-change' ? 'Confirm Change' : mode === 'edit' ? 'Save Changes' : 'Start Work'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

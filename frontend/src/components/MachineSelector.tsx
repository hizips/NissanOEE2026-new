import { useRef, useEffect } from 'react';
import type { Machine } from '@/types';
import { ChevronLeft, ChevronRight, Factory } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MachineSelectorProps {
  machines: Machine[];
  selectedMachineId: string;
  onSelectMachine: (machineId: string) => void;
}

// Machine visual configurations with colors
const machineVisuals: Record<string, { gradient: string; icon: string }> = {
  // Casting machines
  'Casting Machine A1': { gradient: 'from-blue-600 to-blue-800', icon: '🏭' },
  'Casting Machine A2': { gradient: 'from-indigo-600 to-indigo-800', icon: '🏭' },
  'Die Cast Machine B1': { gradient: 'from-purple-600 to-purple-800', icon: '🏭' },
  // Machining machines
  'CNC Machine B1': { gradient: 'from-emerald-600 to-emerald-800', icon: '⚙️' },
  'CNC Machine B2': { gradient: 'from-teal-600 to-teal-800', icon: '⚙️' },
  'Milling Machine C1': { gradient: 'from-cyan-600 to-cyan-800', icon: '🔧' },
  'Drilling Machine D1': { gradient: 'from-orange-600 to-orange-800', icon: '🔩' },
  'Finishing Machine E2': { gradient: 'from-rose-600 to-rose-800', icon: '✨' },
};

export function MachineSelector({ machines, selectedMachineId, onSelectMachine }: MachineSelectorProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 320; // Slightly more than card width
      const newScrollLeft = scrollContainerRef.current.scrollLeft + (direction === 'right' ? scrollAmount : -scrollAmount);
      scrollContainerRef.current.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
    }
  };

  // Auto-scroll to selected machine
  useEffect(() => {
    if (selectedMachineId && scrollContainerRef.current) {
      const selectedIndex = machines.findIndex(m => m.id === selectedMachineId);
      if (selectedIndex !== -1) {
        const cardWidth = 300;
        const gap = 16;
        const scrollPosition = selectedIndex * (cardWidth + gap);
        scrollContainerRef.current.scrollTo({ left: scrollPosition, behavior: 'smooth' });
      }
    }
  }, [selectedMachineId, machines]);

  return (
    <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Factory className="h-5 w-5 text-blue-600" />
            Select Your Machine *
          </h3>

          {/* Navigation Buttons - GLOVE-FRIENDLY */}
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => scroll('left')}
              className="h-14 w-14 p-0 border-2"
            >
              <ChevronLeft className="h-7 w-7" />
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => scroll('right')}
              className="h-14 w-14 p-0 border-2"
            >
              <ChevronRight className="h-7 w-7" />
            </Button>
          </div>
        </div>

        {/* Scrollable Machine Cards Container */}
          <div
                    ref={scrollContainerRef}
                    className="flex gap-4 overflow-x-auto py-6 px-4 scroll-smooth hide-scrollbar snap-x snap-mandatory overflow-y-visible"
                    style={{
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                    }}
                  >
          {machines.map((machine) => {
            const isSelected = machine.id === selectedMachineId;
            const visual = machineVisuals[machine.name] || { gradient: 'from-slate-600 to-slate-800', icon: '⚙️' };

            return (
              <button
                key={machine.id}
                type="button"
                onClick={() => onSelectMachine(machine.id)}
                className={`
                  flex-shrink-0 w-[300px] snap-center rounded-xl transition-all duration-300 cursor-pointer
                  ${isSelected
                    ? 'ring-4 ring-blue-500 shadow-2xl scale-105 border-4 border-blue-400'
                    : 'border-4 border-slate-300 shadow-lg hover:shadow-xl hover:scale-102 hover:border-blue-300'
                  }
                `}
              >
                {/* Machine Visual Card */}
                <div className={`bg-gradient-to-br ${visual.gradient} p-8 rounded-t-lg h-36 flex items-center justify-center relative overflow-hidden`}>
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-4 left-4 w-20 h-20 border-4 border-white rounded-full"></div>
                    <div className="absolute bottom-4 right-4 w-16 h-16 border-4 border-white rounded-lg"></div>
                  </div>

                  {/* Machine Icon/Emoji */}
                  <div className="text-7xl relative z-10 drop-shadow-lg">
                    {visual.icon}
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 bg-blue-500 text-white rounded-full p-2 shadow-lg animate-pulse">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Machine Info */}
                <div className="bg-white p-5 rounded-b-lg">
                  {/* Machine Name */}
                  <h4 className="font-bold text-xl text-slate-800 text-center leading-tight">
                    {machine.name}
                  </h4>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selection Status */}
        {selectedMachineId ? (
          <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="bg-green-500 rounded-full p-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-800">
                  Selected: {machines.find(m => m.id === selectedMachineId)?.name}
                </p>
                <p className="text-sm text-green-700">Machine ready for data entry</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="bg-amber-500 rounded-full p-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-amber-800">Please select a machine</p>
                <p className="text-sm text-amber-700">Tap any machine card above to begin</p>
              </div>
            </div>
          </div>
        )}

        <style>{`
          .hide-scrollbar::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>
  );
}

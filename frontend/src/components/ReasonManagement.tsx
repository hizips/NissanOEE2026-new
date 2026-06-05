import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { DefectReason, DowntimeReasonItem, ProcessReason, Machine, Part } from '@/types';
import { ListChecks, AlertTriangle, Clock, Info } from 'lucide-react';
import { DefectReasonManager } from '@/components/DefectReasonManager';
import { DowntimeReasonManager } from '@/components/DowntimeReasonManager';
import { ProcessReasonManager } from '@/components/ProcessReasonManager';

interface ReasonManagementProps {
  defectReasons: DefectReason[];
  downtimeReasons: DowntimeReasonItem[];
  processReasons: ProcessReason[];
  machines: Machine[];
  parts: Part[];
  onAddDefectReason: (reason: Omit<DefectReason, 'id'>) => void;
  onUpdateDefectReason: (id: string, updates: Partial<DefectReason>) => void;
  onDeleteDefectReason: (id: string) => void;
  onAddDowntimeReason: (reason: Omit<DowntimeReasonItem, 'id'>) => void;
  onUpdateDowntimeReason: (id: string, updates: Partial<DowntimeReasonItem>) => void;
  onDeleteDowntimeReason: (id: string) => void;
  onAddProcessReason: (reason: Omit<ProcessReason, 'id'>) => void;
  onUpdateProcessReason: (id: string, updates: Partial<ProcessReason>) => void;
  onDeleteProcessReason: (id: string) => void;
}

export function ReasonManagement({
  defectReasons,
  downtimeReasons,
  processReasons,
  machines,
  parts,
  onAddDefectReason,
  onUpdateDefectReason,
  onDeleteDefectReason,
  onAddDowntimeReason,
  onUpdateDowntimeReason,
  onDeleteDowntimeReason,
  onAddProcessReason,
  onUpdateProcessReason,
  onDeleteProcessReason,
}: ReasonManagementProps) {
  return (
    <div className="bg-white space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600 rounded-lg">
              <ListChecks className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle>Reason Management</CardTitle>
              <CardDescription>Configure all reason lists used in operator workflows</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-blue-900">About Reason Management</p>
                <p className="text-sm text-blue-800">
                  Configure all selectable reason options used by operators during production. These reasons can be filtered
                  by machine type, specific machines, or parts to show only relevant options to operators.
                </p>
              </div>
            </div>
          </div>

          <Tabs defaultValue="defects" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 h-12">
              <TabsTrigger value="defects" className="gap-2">
                <AlertTriangle className="h-4 w-4" />
                <span>Part Defect Reasons</span>
                <Badge variant="secondary">{defectReasons.filter(r => r.active).length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="downtime" className="gap-2">
                <Clock className="h-4 w-4" />
                <span>Downtime Reasons</span>
                <Badge variant="secondary">{downtimeReasons.filter(r => r.active).length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="process" className="gap-2">
                <ListChecks className="h-4 w-4" />
                <span>Process Reasons</span>
                <Badge variant="secondary">{processReasons.filter(r => r.active).length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="defects" className="mt-6">
              <DefectReasonManager
                defectReasons={defectReasons}
                machines={machines}
                parts={parts}
                onAdd={onAddDefectReason}
                onUpdate={onUpdateDefectReason}
                onDelete={onDeleteDefectReason}
              />
            </TabsContent>

            <TabsContent value="downtime" className="mt-6">
              <DowntimeReasonManager
                downtimeReasons={downtimeReasons}
                machines={machines}
                onAdd={onAddDowntimeReason}
                onUpdate={onUpdateDowntimeReason}
                onDelete={onDeleteDowntimeReason}
              />
            </TabsContent>

            <TabsContent value="process" className="mt-6">
              <ProcessReasonManager
                processReasons={processReasons}
                machines={machines}
                parts={parts}
                onAdd={onAddProcessReason}
                onUpdate={onUpdateProcessReason}
                onDelete={onDeleteProcessReason}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

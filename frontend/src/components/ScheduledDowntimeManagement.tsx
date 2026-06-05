import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ScheduledDowntime, Machine } from '@/types';
import { Plus, Edit2, Trash2, Calendar, Clock, Info } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ScheduledDowntimeManagementProps {
  scheduledDowntimes: ScheduledDowntime[];
  machines: Machine[];
  onAdd: (downtime: Omit<ScheduledDowntime, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<ScheduledDowntime>) => void;
  onDelete: (id: string) => void;
}

const DOWNTIME_REASONS = [
  'Preventive Maintenance',
  'Inspection',
  'Cooling',
  'Cleaning',
  'Tool Preparation',
  'Scheduled Service',
  'Die Change',
  'Part Change',
  'Other',
];

export function ScheduledDowntimeManagement({
  scheduledDowntimes,
  machines,
  onAdd,
  onUpdate,
  onDelete,
}: ScheduledDowntimeManagementProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDowntime, setEditingDowntime] = useState<ScheduledDowntime | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [downtimeToDelete, setDowntimeToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    machineId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '14:00',
    endTime: '15:00',
    reason: 'Preventive Maintenance',
    comment: '',
  });

  const calculateDuration = (startTime: string, endTime: string): number => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return endMinutes - startMinutes;
  };

  const handleOpenDialog = (downtime?: ScheduledDowntime) => {
    if (downtime) {
      setEditingDowntime(downtime);
      setFormData({
        machineId: downtime.machineId,
        date: downtime.date,
        startTime: downtime.startTime,
        endTime: downtime.endTime,
        reason: downtime.reason,
        comment: downtime.comment || '',
      });
    } else {
      setEditingDowntime(null);
      setFormData({
        machineId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        startTime: '14:00',
        endTime: '15:00',
        reason: 'Preventive Maintenance',
        comment: '',
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingDowntime(null);
  };

  const handleSubmit = () => {
    if (!formData.machineId) {
      toast.error('Please select a machine');
      return;
    }

    if (!formData.date) {
      toast.error('Please select a date');
      return;
    }

    const duration = calculateDuration(formData.startTime, formData.endTime);
    if (duration <= 0) {
      toast.error('End time must be after start time');
      return;
    }

    const machine = machines.find(m => m.id === formData.machineId);
    if (!machine) {
      toast.error('Invalid machine');
      return;
    }

    const downtimeData = {
      machineId: formData.machineId,
      machineName: machine.name,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      duration,
      reason: formData.reason,
      comment: formData.comment || undefined,
    };

    if (editingDowntime) {
      onUpdate(editingDowntime.id, downtimeData);
      toast.success('Scheduled downtime updated successfully');
    } else {
      onAdd(downtimeData);
      toast.success('Scheduled downtime added successfully');
    }
    handleCloseDialog();
  };

  const handleDelete = (id: string) => {
    setDowntimeToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (downtimeToDelete) {
      onDelete(downtimeToDelete);
      toast.success('Scheduled downtime deleted successfully');
      setDowntimeToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  // Group downtimes by date for better display
  const groupedDowntimes = scheduledDowntimes.reduce((acc, downtime) => {
    if (!acc[downtime.date]) {
      acc[downtime.date] = [];
    }
    acc[downtime.date].push(downtime);
    return acc;
  }, {} as Record<string, ScheduledDowntime[]>);

  // Sort dates
  const sortedDates = Object.keys(groupedDowntimes).sort((a, b) => {
    return new Date(b).getTime() - new Date(a).getTime();
  });

  return (
    <div className="bg-white">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-600 rounded-lg">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle>Scheduled Downtime Management</CardTitle>
                <CardDescription>Pre-register planned machine stoppages for maintenance, cleaning, and servicing</CardDescription>
              </div>
            </div>
            <Button onClick={() => handleOpenDialog()} className="bg-slate-950 text-white hover:bg-slate-800 gap-2 px-4 shadow-sm">
              <Plus className="h-4 w-4" />
              Add Scheduled Downtime
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-blue-900">About Scheduled Downtime</p>
                <p className="text-sm text-blue-800">
                  Scheduled downtime is automatically excluded from OEE calculations as planned stoppage time.
                  This includes preventive maintenance, inspections, cleaning, and other planned activities.
                </p>
              </div>
            </div>
          </div>

          {sortedDates.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed rounded-lg">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scheduled downtime records yet.</p>
              <p className="text-sm">Click "Add Scheduled Downtime" to get started.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedDates.map(date => (
                <div key={date} className="border rounded-lg p-4">
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    {format(new Date(date), 'EEEE, MMMM dd, yyyy')}
                    <Badge variant="secondary">{groupedDowntimes[date].length} event(s)</Badge>
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Machine</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Comment</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupedDowntimes[date].map(downtime => (
                        <TableRow key={downtime.id}>
                          <TableCell className="font-medium">{downtime.machineName}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4 text-slate-500" />
                              {downtime.startTime} – {downtime.endTime}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{downtime.duration} min</Badge>
                          </TableCell>
                          <TableCell>{downtime.reason}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {downtime.comment || '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenDialog(downtime)}
                                className="gap-2"
                              >
                                <Edit2 className="h-4 w-4" />
                                Edit
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(downtime.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2"
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingDowntime ? 'Edit' : 'Add'} Scheduled Downtime</DialogTitle>
            <DialogDescription>
              Pre-register planned machine stoppage for maintenance or servicing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="machine">Machine *</Label>
              <Select
                value={formData.machineId}
                onValueChange={(value) => setFormData({ ...formData, machineId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select machine..." />
                </SelectTrigger>
                <SelectContent>
                  {machines.filter(m => m.active).map(machine => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start Time *</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">End Time *</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>

            <div className="bg-slate-100 border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Duration:</span>
                <Badge variant="secondary" className="text-base">
                  {calculateDuration(formData.startTime, formData.endTime)} minutes
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason *</Label>
              <Select
                value={formData.reason}
                onValueChange={(value) => setFormData({ ...formData, reason: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOWNTIME_REASONS.map(reason => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Comment (Optional)</Label>
              <Textarea
                id="comment"
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                placeholder="Additional details about this scheduled downtime..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button variant="outline" onClick={handleSubmit}>
              {editingDowntime ? 'Update' : 'Add'} Scheduled Downtime
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scheduled Downtime</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scheduled downtime? This action cannot be undone.
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
    </div>
  );
}

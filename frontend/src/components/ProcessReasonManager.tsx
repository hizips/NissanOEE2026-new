import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ProcessReason, Machine, Part } from '@/types';
import { Plus, Edit2, Trash2, ListChecks, Factory, Package } from 'lucide-react';
import { toast } from 'sonner';

interface ProcessReasonManagerProps {
  processReasons: ProcessReason[];
  machines: Machine[];
  parts: Part[];
  onAdd: (reason: Omit<ProcessReason, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<ProcessReason>) => void;
  onDelete: (id: string) => void;
}

export function ProcessReasonManager({
  processReasons,
  machines,
  parts,
  onAdd,
  onUpdate,
  onDelete,
}: ProcessReasonManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<ProcessReason | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reasonToDelete, setReasonToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    machineTypes: [] as ('casting' | 'machining')[],
    machineIds: [] as string[],
    partIds: [] as string[],
    active: true,
  });

  const handleOpenDialog = (reason?: ProcessReason) => {
    if (reason) {
      setEditingReason(reason);
      setFormData({
        name: reason.name,
        description: reason.description || '',
        machineTypes: reason.machineTypes || [],
        machineIds: reason.machineIds || [],
        partIds: reason.partIds || [],
        active: reason.active,
      });
    } else {
      setEditingReason(null);
      setFormData({
        name: '',
        description: '',
        machineTypes: [],
        machineIds: [],
        partIds: [],
        active: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingReason(null);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a name');
      return;
    }

    if (editingReason) {
      onUpdate(editingReason.id, formData);
      toast.success('Process reason updated successfully');
    } else {
      onAdd(formData);
      toast.success('Process reason added successfully');
    }
    handleCloseDialog();
  };

  const handleDelete = (id: string) => {
    setReasonToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (reasonToDelete) {
      onDelete(reasonToDelete);
      toast.success('Process reason deleted successfully');
      setReasonToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const toggleMachineType = (type: 'casting' | 'machining') => {
    setFormData(prev => ({
      ...prev,
      machineTypes: prev.machineTypes.includes(type)
        ? prev.machineTypes.filter(t => t !== type)
        : [...prev.machineTypes, type],
    }));
  };

  const toggleMachine = (machineId: string) => {
    setFormData(prev => ({
      ...prev,
      machineIds: prev.machineIds.includes(machineId)
        ? prev.machineIds.filter(id => id !== machineId)
        : [...prev.machineIds, machineId],
    }));
  };

  const togglePart = (partId: string) => {
    setFormData(prev => ({
      ...prev,
      partIds: prev.partIds.includes(partId)
        ? prev.partIds.filter(id => id !== partId)
        : [...prev.partIds, partId],
    }));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-5 w-5" />
                Production Process Reasons
              </CardTitle>
              <CardDescription>
                Configure general production issue reasons for shift comments, excluded shots, and process notes
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} className="bg-slate-950 text-white hover:bg-slate-800 gap-2 px-4 shadow-sm">
              <Plus className="h-4 w-4" />
              Add Process Reason
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {processReasons.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed rounded-lg">
              <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No process reasons configured yet.</p>
              <p className="text-sm">Click "Add Process Reason" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Filters</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {processReasons.map(reason => (
                  <TableRow key={reason.id}>
                    <TableCell className="font-medium">{reason.name}</TableCell>
                    <TableCell className="text-sm text-slate-600">{reason.description || '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {reason.machineTypes && reason.machineTypes.length > 0 && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Factory className="h-3 w-3" />
                            {reason.machineTypes.join(', ')}
                          </Badge>
                        )}
                        {reason.machineIds && reason.machineIds.length > 0 && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Factory className="h-3 w-3" />
                            {reason.machineIds.length} machine(s)
                          </Badge>
                        )}
                        {reason.partIds && reason.partIds.length > 0 && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Package className="h-3 w-3" />
                            {reason.partIds.length} part(s)
                          </Badge>
                        )}
                        {(!reason.machineTypes || reason.machineTypes.length === 0) &&
                         (!reason.machineIds || reason.machineIds.length === 0) &&
                         (!reason.partIds || reason.partIds.length === 0) && (
                          <Badge variant="secondary" className="text-xs">All</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={reason.active ? 'bg-green-600' : 'bg-gray-500'}>
                        {reason.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDialog(reason)}
                          className="gap-2"
                        >
                          <Edit2 className="h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(reason.id)}
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
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReason ? 'Edit' : 'Add'} Process Reason</DialogTitle>
            <DialogDescription>
              Configure a production process reason for shift comments, excluded shots, and process adjustments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Material Issue, Warm-up Shot, Engineering Trial"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description of when to use this reason"
                rows={3}
              />
            </div>

          <div className="space-y-2">
            <Label>Filter by Machine Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={formData.machineTypes.includes('casting') ? 'default' : 'outline'}
                onClick={() => toggleMachineType('casting')}
                className={`flex-1 transition-colors ${
                  formData.machineTypes.includes('casting') 
                    ? 'bg-slate-950 text-white hover:bg-slate-800' 
                    : ''
                }`}
              >
                Casting
              </Button>
              <Button
                type="button"
                variant={formData.machineTypes.includes('machining') ? 'default' : 'outline'}
                onClick={() => toggleMachineType('machining')}
                className={`flex-1 transition-colors ${
                  formData.machineTypes.includes('machining') 
                    ? 'bg-slate-950 text-white hover:bg-slate-800' 
                    : ''
                }`}
              >
                Machining
              </Button>
            </div>
            <p className="text-xs text-slate-500">Leave empty to show for all machine types</p>
          </div>

            <div className="space-y-2">
              <Label>Filter by Specific Machines</Label>
              <div className="border rounded-lg p-3 max-h-32 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {machines.filter(m => m.active).map(machine => (
                    <label key={machine.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.machineIds.includes(machine.id)}
                        onChange={() => toggleMachine(machine.id)}
                        className="h-4 w-4"
                      />
                      <span>{machine.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">Leave empty to show for all machines</p>
            </div>

            <div className="space-y-2">
              <Label>Filter by Specific Parts</Label>
              <div className="border rounded-lg p-3 max-h-32 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2">
                  {parts.filter(p => p.active).map(part => (
                    <label key={part.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.partIds.includes(part.id)}
                        onChange={() => togglePart(part.id)}
                        className="h-4 w-4"
                      />
                      <span>{part.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-500">Leave empty to show for all parts</p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="active"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="active">Active (shown to operators)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingReason ? 'Update' : 'Add'} Process Reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Process Reason</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this process reason? This action cannot be undone.
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
    </>
  );
}

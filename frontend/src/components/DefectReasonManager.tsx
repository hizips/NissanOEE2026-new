import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { DefectReason, Machine, Part } from '@/types';
import { Plus, Edit2, Trash2, Factory, Package, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface DefectReasonManagerProps {
  defectReasons: DefectReason[];
  machines: Machine[];
  parts: Part[];
  onAdd: (reason: Omit<DefectReason, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<DefectReason>) => void;
  onDelete: (id: string) => void;
}

export function DefectReasonManager({
  defectReasons,
  machines,
  parts,
  onAdd,
  onUpdate,
  onDelete,
}: DefectReasonManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<DefectReason | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reasonToDelete, setReasonToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    category: '',
    subcategory: '',
    specificReason: '',
    machineTypes: [] as ('casting' | 'machining')[],
    machineIds: [] as string[],
    partIds: [] as string[],
    active: true,
  });

  const handleOpenDialog = (reason?: DefectReason) => {
    if (reason) {
      setEditingReason(reason);
      setFormData({
        category: reason.category,
        subcategory: reason.subcategory,
        specificReason: reason.specificReason,
        machineTypes: reason.machineTypes || [],
        machineIds: reason.machineIds || [],
        partIds: reason.partIds || [],
        active: reason.active,
      });
    } else {
      setEditingReason(null);
      setFormData({
        category: '',
        subcategory: '',
        specificReason: '',
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
    if (!formData.category.trim() || !formData.subcategory.trim() || !formData.specificReason.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (editingReason) {
      onUpdate(editingReason.id, formData);
      toast.success('Defect reason updated successfully');
    } else {
      onAdd(formData);
      toast.success('Defect reason added successfully');
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
      toast.success('Defect reason deleted successfully');
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

  // Group reasons by category for better display
  const groupedReasons = defectReasons.reduce((acc, reason) => {
    if (!acc[reason.category]) {
      acc[reason.category] = [];
    }
    acc[reason.category].push(reason);
    return acc;
  }, {} as Record<string, DefectReason[]>);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Part Defect Reasons
              </CardTitle>
              <CardDescription>
                Configure defect categories, subcategories, and specific reasons for part quality issues
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} className="bg-slate-950 text-white hover:bg-slate-800 gap-2 px-4 shadow-sm">
              <Plus className="h-4 w-4" />
              Add Defect Reason
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {Object.keys(groupedReasons).length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed rounded-lg">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No defect reasons configured yet.</p>
              <p className="text-sm">Click "Add Defect Reason" to get started.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedReasons).map(([category, reasons]) => (
                <div key={category} className="border rounded-lg p-4">
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    {category}
                    <Badge variant="secondary">{reasons.length}</Badge>
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subcategory</TableHead>
                        <TableHead>Specific Reason</TableHead>
                        <TableHead>Filters</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reasons.map(reason => (
                        <TableRow key={reason.id}>
                          <TableCell className="font-medium">{reason.subcategory}</TableCell>
                          <TableCell>{reason.specificReason}</TableCell>
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReason ? 'Edit' : 'Add'} Defect Reason</DialogTitle>
            <DialogDescription>
              Configure a hierarchical defect reason with category, subcategory, and specific reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Main Category *</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Casting Defect, Machining Defect"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subcategory">Subcategory *</Label>
                <Input
                  id="subcategory"
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                  placeholder="e.g., Porosity, Tool Related"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="specificReason">Specific Reason *</Label>
                <Input
                  id="specificReason"
                  value={formData.specificReason}
                  onChange={(e) => setFormData({ ...formData, specificReason: e.target.value })}
                  placeholder="e.g., Surface Porosity, Tool Breakage Mark"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Filter by Machine Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  // Change variant logic to stay 'outline' or 'ghost' but force colors via className
                  variant={formData.machineTypes.includes('casting') ? 'default' : 'outline'}
                  onClick={() => toggleMachineType('casting')}
                  className={`flex-1 ${formData.machineTypes.includes('casting')
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
                  className={`flex-1 ${formData.machineTypes.includes('machining')
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
            <Button variant="outline" onClick={handleSubmit}>
              {editingReason ? 'Update' : 'Add'} Defect Reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Defect Reason</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this defect reason? This action cannot be undone.
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

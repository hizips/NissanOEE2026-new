import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { DowntimeReasonItem, Machine } from '@/types';
import { Plus, Edit2, Trash2, ChevronRight, ChevronDown, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface DowntimeReasonManagerProps {
  downtimeReasons: DowntimeReasonItem[];
  machines: Machine[];
  onAdd: (reason: Omit<DowntimeReasonItem, 'id'>) => void;
  onUpdate: (id: string, updates: Partial<DowntimeReasonItem>) => void;
  onDelete: (id: string) => void;
}

export function DowntimeReasonManager({
  downtimeReasons,
  machines,
  onAdd,
  onUpdate,
  onDelete,
}: DowntimeReasonManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReason, setEditingReason] = useState<DowntimeReasonItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reasonToDelete, setReasonToDelete] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const [formData, setFormData] = useState({
    level: 1 as 1 | 2 | 3 | 4,
    parentId: '',
    name: '',
    requiresExtraField: false,
    extraFieldLabel: '',
    machineTypes: [] as ('casting' | 'machining')[],
    machineIds: [] as string[],
    active: true,
  });

  const handleOpenDialog = (reason?: DowntimeReasonItem, parentLevel?: 1 | 2 | 3, parentId?: string) => {
    if (reason) {
      setEditingReason(reason);
      setFormData({
        level: reason.level,
        parentId: reason.parentId || '',
        name: reason.name,
        requiresExtraField: reason.requiresExtraField || false,
        extraFieldLabel: reason.extraFieldLabel || '',
        machineTypes: reason.machineTypes || [],
        machineIds: reason.machineIds || [],
        active: reason.active,
      });
    } else {
      setEditingReason(null);
      const newLevel = parentLevel ? ((parentLevel + 1) as 1 | 2 | 3 | 4) : 1;
      setFormData({
        level: newLevel,
        parentId: parentId || '',
        name: '',
        requiresExtraField: false,
        extraFieldLabel: '',
        machineTypes: [],
        machineIds: [],
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

    if (formData.level > 1 && !formData.parentId) {
      toast.error('Please select a parent');
      return;
    }

    if (editingReason) {
      onUpdate(editingReason.id, formData);
      toast.success('Downtime reason updated successfully');
    } else {
      onAdd(formData);
      toast.success('Downtime reason added successfully');
    }
    handleCloseDialog();
  };

  const handleDelete = (id: string) => {
    // Check if this reason has children
    const hasChildren = downtimeReasons.some(r => r.parentId === id);
    if (hasChildren) {
      toast.error('Cannot delete a reason that has child items. Delete child items first.');
      return;
    }
    setReasonToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (reasonToDelete) {
      onDelete(reasonToDelete);
      toast.success('Downtime reason deleted successfully');
      setReasonToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const toggleNode = (id: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
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

  const getChildren = (parentId?: string) => {
    return downtimeReasons.filter(r => r.parentId === parentId);
  };

  const renderReasonNode = (reason: DowntimeReasonItem, depth: number = 0) => {
    const children = getChildren(reason.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(reason.id);

    return (
      <div key={reason.id} style={{ marginLeft: `${depth * 24}px` }}>
        <div className="flex items-center gap-2 py-2 px-3 hover:bg-slate-50 rounded group">
          {hasChildren ? (
            <button
              onClick={() => toggleNode(reason.id)}
              className="p-1 hover:bg-slate-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div className="flex-1 flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              L{reason.level}
            </Badge>
            <span className="font-medium">{reason.name}</span>
            {reason.requiresExtraField && (
              <Badge variant="secondary" className="text-xs">
                Extra Field: {reason.extraFieldLabel}
              </Badge>
            )}
            {reason.machineTypes && reason.machineTypes.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {reason.machineTypes.join(', ')}
              </Badge>
            )}
            <Badge className={reason.active ? 'bg-green-600' : 'bg-gray-500'}>
              {reason.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div className="opacity-0 group-hover:opacity-100 flex gap-2">
            {reason.level < 4 && (
              <Button
                variant="outline"
                size="sm"
                //onClick={() => handleOpenDialog(undefined, reason.level, reason.id)}
                onClick={() => handleOpenDialog(undefined, reason.level as 1 | 2 | 3, reason.id)}
                className="gap-1 h-7"
              >
                <Plus className="h-3 w-3" />
                Add Child
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpenDialog(reason)}
              className="gap-1 h-7"
            >
              <Edit2 className="h-3 w-3" />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDelete(reason.id)}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1 h-7"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </Button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {children.map(child => renderReasonNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const level1Reasons = downtimeReasons.filter(r => r.level === 1);

  const getParentOptions = () => {
    if (formData.level === 1) return [];
    const parentLevel = (formData.level - 1) as 1 | 2 | 3;
    return downtimeReasons.filter(r => r.level === parentLevel && r.active);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Downtime Reasons (4-Level Hierarchy)
              </CardTitle>
              <CardDescription>
                Configure hierarchical downtime reasons: Category → Subsystem → Component → Specific Item
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()} className="bg-slate-950 text-white hover:bg-slate-800 gap-2 px-4 shadow-sm">
              <Plus className="h-4 w-4" />
              Add Level 1 Category
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-900">
              <strong>Tip:</strong> Build a hierarchy by adding Level 1 categories first, then add child items at deeper levels.
              Operators can save downtime at any level if they don't know the specific cause.
            </p>
          </div>

          {level1Reasons.length === 0 ? (
            <div className="text-center py-12 text-slate-500 border border-dashed rounded-lg">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No downtime reasons configured yet.</p>
              <p className="text-sm">Click "Add Level 1 Category" to get started.</p>
            </div>
          ) : (
            <div className="border rounded-lg bg-white">
              {level1Reasons.map(reason => renderReasonNode(reason))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReason ? 'Edit' : 'Add'} Downtime Reason</DialogTitle>
            <DialogDescription>
              Configure a downtime reason at any hierarchy level (1-4).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Hierarchy Level</Label>
              <Select
                value={formData.level.toString()}
                onValueChange={(value) => setFormData({ ...formData, level: parseInt(value) as 1 | 2 | 3 | 4, parentId: '' })}
                disabled={!!editingReason}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Level 1 - Category</SelectItem>
                  <SelectItem value="2">Level 2 - Subsystem</SelectItem>
                  <SelectItem value="3">Level 3 - Component</SelectItem>
                  <SelectItem value="4">Level 4 - Specific Item</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.level > 1 && (
              <div className="space-y-2">
                <Label>Parent {formData.level === 2 ? 'Category' : formData.level === 3 ? 'Subsystem' : 'Component'} *</Label>
                <Select
                  value={formData.parentId}
                  onValueChange={(value) => setFormData({ ...formData, parentId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {getParentOptions().map(parent => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={
                  formData.level === 1 ? 'e.g., Machine, Material' :
                  formData.level === 2 ? 'e.g., Die, Hydraulic System' :
                  formData.level === 3 ? 'e.g., Ejector, Pump' :
                  'e.g., Ejector Pin Broken'
                }
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="requiresExtraField"
                  checked={formData.requiresExtraField}
                  onChange={(e) => setFormData({ ...formData, requiresExtraField: e.target.checked })}
                  className="h-4 w-4"
                />
                <Label htmlFor="requiresExtraField">Requires Extra Input Field</Label>
              </div>
              {formData.requiresExtraField && (
                <Input
                  value={formData.extraFieldLabel}
                  onChange={(e) => setFormData({ ...formData, extraFieldLabel: e.target.value })}
                  placeholder="e.g., New Die Number, Part Number"
                />
              )}
            </div>

          <div className="space-y-2">
            <Label>Filter by Machine Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                // Toggle variant and add explicit background/text colors when active
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
              {editingReason ? 'Update' : 'Add'} Downtime Reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Downtime Reason</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this downtime reason? This action cannot be undone.
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

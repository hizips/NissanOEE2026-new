import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Part, Die } from '@/types';
import { Package, Plus, Edit, Trash2, Search, CheckCircle2, XCircle, Grid3x3, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface PartManagementProps {
  parts: Part[];
  onAddPart: (part: Omit<Part, 'id'>) => void;
  onUpdatePart: (id: string, part: Partial<Part>) => void;
  onDeletePart: (id: string) => void;
  onAddDie: (partId: string, currentDieIds: string[], dieName: string, dieNumber: string) => Promise<Part>;
  onRemoveDie: (partId: string, currentDieIds: string[], dieIdToRemove: string) => Promise<Part>;
}

export function PartManagement({ parts, onAddPart, onUpdatePart, onDeletePart, onAddDie, onRemoveDie }: PartManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [dieDialogOpen, setDieDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [partToDelete, setPartToDelete] = useState<string | null>(null);
  const [managingDiesPart, setManagingDiesPart] = useState<Part | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    partNumber: '',
    cycleTime: 0,
    image: '',
    active: true,
    dies: [] as Die[],
  });

  const [dieFormData, setDieFormData] = useState({
    name: '',
    dieNumber: '',
  });

  const filteredParts = parts.filter(part =>
    part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    part.partNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDialog = (part?: Part) => {
    if (part) {
      setEditingPart(part);
      setFormData({
        name: part.name,
        partNumber: part.partNumber,
        cycleTime: part.cycleTime,
        image: part.image || '',
        active: part.active,
        dies: part.dies || [],
      });
    } else {
      setEditingPart(null);
      setFormData({
        name: '',
        partNumber: '',
        cycleTime: 0,
        image: '',
        active: true,
        dies: [],
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingPart(null);
    setFormData({
      name: '',
      partNumber: '',
      cycleTime: 0,
      image: '',
      active: true,
      dies: [],
    });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.partNumber || formData.cycleTime <= 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (editingPart) {
      onUpdatePart(editingPart.id, formData);
      toast.success('Part updated successfully');
    } else {
      onAddPart(formData);
      toast.success('Part added successfully');
    }

    handleCloseDialog();
  };

  const handleDelete = (id: string) => {
    setPartToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (partToDelete) {
      onDeletePart(partToDelete);
      toast.success('Part deleted successfully');
      setPartToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const toggleActive = (part: Part) => {
    onUpdatePart(part.id, { active: !part.active });
    toast.success(`Part ${part.active ? 'deactivated' : 'activated'} successfully`);
  };

  const handleManageDies = (part: Part) => {
    setManagingDiesPart(part);
    setDieDialogOpen(true);
  };

  const handleAddDie = async () => {
    if (!dieFormData.name || !dieFormData.dieNumber) {
      toast.error('Please fill in all die fields');
      return;
    }

    if (!managingDiesPart) return;

    try {
      const currentDieIds = (managingDiesPart.dies || []).map(d => d.id);
      const updatedPart = await onAddDie(managingDiesPart.id, currentDieIds, dieFormData.name, dieFormData.dieNumber);
      setManagingDiesPart(updatedPart);
      setDieFormData({ name: '', dieNumber: '' });
    } catch {
      // error already shown by parent
    }
  };

  const handleRemoveDie = async (dieId: string) => {
    if (!managingDiesPart) return;

    try {
      const currentDieIds = (managingDiesPart.dies || []).map(d => d.id);
      const updatedPart = await onRemoveDie(managingDiesPart.id, currentDieIds, dieId);
      setManagingDiesPart(updatedPart);
    } catch {
      // error already shown by parent
    }
  };

  return (
    <div className="bg-white space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 text-purple-600" />
              <div>
                <CardTitle>Part Management</CardTitle>
                <CardDescription>Manage parts, cycle times, and applicable dies</CardDescription>
              </div>
            </div>
            <Button onClick={() => handleOpenDialog()} className="bg-slate-950 text-white hover:bg-slate-800 gap-2 px-4 shadow-sm">
              <Plus className="h-4 w-4" />
              Add Part
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search parts by name or part number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part Name</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Cycle Time</TableHead>
                  <TableHead>Dies</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredParts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                      No parts found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredParts.map(part => (
                    <TableRow key={part.id}>
                      <TableCell className="font-medium">{part.name}</TableCell>
                      <TableCell>{part.partNumber}</TableCell>
                      <TableCell>{part.cycleTime} min</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleManageDies(part)}
                          className="gap-1"
                        >
                          <Grid3x3 className="h-3 w-3" />
                          {part.dies?.length || 0} dies
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={part.active ? 'bg-green-600 cursor-pointer' : 'bg-slate-400 cursor-pointer'}
                          onClick={() => toggleActive(part)}
                        >
                          {part.active ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Active
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Inactive
                            </>
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDialog(part)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(part.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="text-sm text-slate-600 text-center">
            Showing {filteredParts.length} of {parts.length} parts
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingPart ? 'Edit Part' : 'Add New Part'}</DialogTitle>
            <DialogDescription>
              {editingPart ? 'Update part information' : 'Enter part details to add to the system'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partName">Part Name *</Label>
                <Input
                  id="partName"
                  placeholder="e.g., Cylinder Head"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partNumber">Part Number *</Label>
                <Input
                  id="partNumber"
                  placeholder="e.g., CH-001"
                  value={formData.partNumber}
                  onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cycleTime">Cycle Time (minutes) *</Label>
              <Input
                id="cycleTime"
                type="number"
                step="0.1"
                min="0"
                placeholder="e.g., 2.5"
                value={formData.cycleTime || ''}
                onChange={(e) => setFormData({ ...formData, cycleTime: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Part Image URL (optional)</Label>
              <Input
                id="image"
                placeholder="https://example.com/image.jpg"
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
            <Button onClick={handleSubmit} variant="outline">
              {editingPart ? 'Update' : 'Add'} Part
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dieDialogOpen} onOpenChange={setDieDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Dies - {managingDiesPart?.name}</DialogTitle>
            <DialogDescription>
              Add or remove dies applicable to this part
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <h4 className="font-semibold mb-3">Add New Die</h4>
              <div className="flex gap-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="dieName">Die Name</Label>
                  <Input
                    id="dieName"
                    placeholder="e.g., Die #1"
                    value={dieFormData.name}
                    onChange={(e) => setDieFormData({ ...dieFormData, name: e.target.value })}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Label htmlFor="dieNumber">Die Number</Label>
                  <Input
                    id="dieNumber"
                    placeholder="e.g., D001"
                    value={dieFormData.dieNumber}
                    onChange={(e) => setDieFormData({ ...dieFormData, dieNumber: e.target.value })}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddDie} className="bg-green-600 hover:bg-green-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold">Applicable Dies</h4>
              {!managingDiesPart?.dies || managingDiesPart.dies.length === 0 ? (
                <div className="text-center py-8 text-slate-500 border rounded-lg">
                  No dies added yet
                </div>
              ) : (
                <div className="border rounded-lg divide-y">
                  {managingDiesPart.dies.map(die => (
                    <div key={die.id} className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <Grid3x3 className="h-4 w-4 text-purple-600" />
                        <div>
                          <div className="font-medium">{die.name}</div>
                          <div className="text-sm text-slate-600">{die.dieNumber}</div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveDie(die.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => {
              setDieDialogOpen(false);
              setManagingDiesPart(null);
              setDieFormData({ name: '', dieNumber: '' });
            }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Part</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this part? This action cannot be undone.
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

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { Operator } from '@/types';
import { Users, Plus, Edit, Trash2, Search, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface OperatorManagementProps {
  operators: Operator[];
  onAddOperator: (operator: Omit<Operator, 'id'>) => void;
  onUpdateOperator: (id: string, operator: Partial<Operator>) => void;
  onDeleteOperator: (id: string) => void;
}

export function OperatorManagement({ operators, onAddOperator, onUpdateOperator, onDeleteOperator }: OperatorManagementProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [operatorToDelete, setOperatorToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    employeeId: '',
    role: '',
    active: true,
  });

  const filteredOperators = operators.filter(op =>
    op.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    op.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDialog = (operator?: Operator) => {
    if (operator) {
      setEditingOperator(operator);
      setFormData({
        name: operator.name,
        employeeId: operator.employeeId,
        role: operator.role,
        active: operator.active,
      });
    } else {
      setEditingOperator(null);
      setFormData({
        name: '',
        employeeId: '',
        role: '',
        active: true,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingOperator(null);
    setFormData({
      name: '',
      employeeId: '',
      role: '',
      active: true,
    });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.employeeId || !formData.role) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (editingOperator) {
      onUpdateOperator(editingOperator.id, formData);
      toast.success('Operator updated successfully');
    } else {
      onAddOperator(formData);
      toast.success('Operator added successfully');
    }

    handleCloseDialog();
  };

  const handleDelete = (id: string) => {
    setOperatorToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (operatorToDelete) {
      onDeleteOperator(operatorToDelete);
      toast.success('Operator deleted successfully');
      setOperatorToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const toggleActive = (operator: Operator) => {
    onUpdateOperator(operator.id, { active: !operator.active });
    toast.success(`Operator ${operator.active ? 'deactivated' : 'activated'} successfully`);
  };

  return (
    <div className="bg-white space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-blue-600" />
              <div>
                <CardTitle>Operator Management</CardTitle>
                <CardDescription>Manage operators and their information</CardDescription>
              </div>
            </div>
            <Button onClick={() => handleOpenDialog()} className="bg-slate-950 text-white hover:bg-slate-800 gap-2 px-4 shadow-sm">
              <Plus className="h-4 w-4" />
              Add Operator
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search operators by name, ID, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOperators.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                      No operators found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOperators.map(operator => (
                    <TableRow key={operator.id}>
                      <TableCell className="font-medium">{operator.name}</TableCell>
                      <TableCell>{operator.employeeId}</TableCell>
                      <TableCell>{operator.role}</TableCell>
                      <TableCell>
                        <Badge
                          className={operator.active ? 'bg-green-600 cursor-pointer' : 'bg-slate-400 cursor-pointer'}
                          onClick={() => toggleActive(operator)}
                        >
                          {operator.active ? (
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
                            onClick={() => handleOpenDialog(operator)}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(operator.id)}
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
            Showing {filteredOperators.length} of {operators.length} operators
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOperator ? 'Edit Operator' : 'Add New Operator'}</DialogTitle>
            <DialogDescription>
              {editingOperator ? 'Update operator information' : 'Enter operator details to add to the system'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Operator Name *</Label>
              <Input
                id="name"
                placeholder="Enter operator name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee ID *</Label>
              <Input
                id="employeeId"
                placeholder="Enter employee ID"
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role *</Label>
              <Input
                id="role"
                placeholder="e.g., Operator, Senior Operator, Lead Operator"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
            <Button onClick={handleSubmit}>{editingOperator ? 'Update' : 'Add'} Operator</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Operator</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this operator? This action cannot be undone.
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

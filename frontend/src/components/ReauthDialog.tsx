import { useEffect, useState } from 'react';
import { Lock, LogIn, Shield, User } from 'lucide-react';
import { toast } from 'sonner';

import { loginRequest } from '@/services/api';
import { cancelReauth, completeReauth, subscribeReauth } from '@/services/authSession';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ReauthDialogProps {
  onLogout: () => void;
}

function readSavedUser(): { employeeId: string; role: 'operator' | 'manager' } | null {
  try {
    const raw = sessionStorage.getItem('oee-current-user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function ReauthDialog({ onLogout }: ReauthDialogProps) {
  const saved = readSavedUser();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<'operator' | 'manager'>(saved?.role ?? 'manager');
  const [employeeId, setEmployeeId] = useState(saved?.employeeId ?? '');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => subscribeReauth(setOpen), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error('Password is required.');
      return;
    }

    setIsLoading(true);
    try {
      const username = role === 'operator' ? 'operator' : employeeId;
      const response = await loginRequest({ username, password });
      sessionStorage.setItem('oee-auth-token', response.access);
      sessionStorage.setItem('oee-authenticated', 'true');
      sessionStorage.setItem('oee-current-user', JSON.stringify({ employeeId: username, role }));
      setPassword('');
      toast.success('Signed in again — you can continue where you left off.');
      completeReauth();
    } catch {
      toast.error('Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    cancelReauth('Logged out');
    setPassword('');
    onLogout();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && open) {
          // Keep session data; user must sign in again or log out explicitly.
          setOpen(true);
        }
      }}
    >
      <DialogContent
        className="sm:max-w-md bg-white"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Session expired</DialogTitle>
          <DialogDescription>
            Your login session ended. Sign in again to continue — your unsaved work on this page
            is kept.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reauth-role" className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Role
            </Label>
            <Select
              value={role}
              onValueChange={(v: 'operator' | 'manager') => setRole(v)}
              disabled={isLoading}
            >
              <SelectTrigger id="reauth-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operator">Operator</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === 'manager' && (
            <div className="space-y-2">
              <Label htmlFor="reauth-employee-id">Manager ID</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="reauth-employee-id"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="pl-9"
                  disabled={isLoading}
                  autoComplete="username"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reauth-password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="reauth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                disabled={isLoading}
                autoComplete="current-password"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={handleLogout} disabled={isLoading}>
              Log out
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2 bg-blue-600 hover:bg-blue-700 text-white">
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign in again
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

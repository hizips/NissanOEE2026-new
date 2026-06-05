import { useState } from 'react';
import { authApi } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Factory, User, Lock, LogIn, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface LoginProps {
  onLogin: (employeeId: string, role: 'operator' | 'manager') => void;
}

export function Login({ onLogin }: LoginProps) {
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'operator' | 'manager'>('operator');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password.trim()) {
      toast.error('Password is required.', {
        style: { background: '#ef4444', color: '#ffffff' },
      });
      return;
    }

    setIsLoading(true);

    try {
      const username = role === 'operator' ? 'operator' : employeeId;
      const response = await authApi.login({ username, password });

      // Save token
      sessionStorage.setItem('oee-auth-token', response.access);

      toast.success('Login successful!');
      onLogin(username || 'manager', role);
    } catch (error) {
      toast.error('Invalid credentials. Please try again.', {
        style: { background: '#ef4444', color: '#ffffff' },
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-20"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="p-4 bg-blue-600 rounded-2xl shadow-2xl">
              <Factory className="w-12 h-12 text-white" />
            </div>
          </div>
          <p className="text-4xl font-bold text-white mb-2">OEE Management System</p>
          <p className="text-slate-400 text-lg">Casting Factory Production Monitoring</p>
        </div>

        <Card className="border-2 border-slate-700 shadow-2xl bg-slate-800/50 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-2xl text-center text-white">Staff Login</CardTitle>
            <CardDescription className="text-center text-slate-400">
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="role" className="text-slate-200 text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Role
                </Label>
                <Select value={role} onValueChange={(value: 'operator' | 'manager') => setRole(value)} disabled={isLoading}>
                  <SelectTrigger id="role" className="h-14 bg-slate-900/50 border-slate-600 text-white focus:border-blue-500 text-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span>Operator</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="manager">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        <span>Manager</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role === 'manager' && (
                <div className="space-y-2">
                  <Label htmlFor="employeeId" className="text-slate-200 text-sm font-semibold">
                    Manager ID
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <Input
                      id="employeeId"
                      type="text"
                      placeholder="Enter your manager ID"
                      value={employeeId}
                      onChange={(e) => setEmployeeId(e.target.value)}
                      className="pl-11 h-12 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-200 text-sm font-semibold">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-11 h-12 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
                    disabled={isLoading}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-2 mt-6"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                    Authenticating...
                  </>
                ) : (
                  <>
                    <LogIn className="h-5 w-5" />
                    Login to System
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <div className="flex items-center justify-center gap-4 text-xs text-slate-500">
            <Badge variant="outline" className="border-slate-600 text-slate-400">
              v1.0.0
            </Badge>
            <span>•</span>
            <span>© 2026 Casting Factory</span>
            <span>•</span>
            <span>Secure Access</span>
          </div>
        </div>
      </div>
    </div>
  );
}

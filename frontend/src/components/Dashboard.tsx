import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Machine, ProductionRecord, OEEMetrics } from '@/types';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Activity, CheckCircle2, AlertCircle, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { format, subDays, startOfDay } from 'date-fns';

interface DashboardProps {
  machines: Machine[];
  productionRecords: ProductionRecord[];
}

export function Dashboard({ machines, productionRecords }: DashboardProps) {
  const calculateOEE = (record: ProductionRecord, machine: Machine): OEEMetrics => {
    const operatingTime = record.plannedProductionTime - record.downtime;

    // Availability = (Operating Time / Planned Production Time) × 100%
    const availability = record.plannedProductionTime > 0
      ? (operatingTime / record.plannedProductionTime) * 100
      : 0;

    // Performance = (Ideal Cycle Time × Total Count / Operating Time) × 100%
    const performance = operatingTime > 0
      ? ((machine.idealCycleTime * record.totalCount) / operatingTime) * 100
      : 0;

    // Quality = (Good Count / Total Count) × 100%
    const quality = record.totalCount > 0
      ? (record.goodCount / record.totalCount) * 100
      : 0;

    // OEE = Availability × Performance × Quality
    const oee = (availability * performance * quality) / 10000;

    return {
      availability: Math.min(availability, 100),
      performance: Math.min(performance, 100),
      quality: Math.min(quality, 100),
      oee: Math.min(oee, 100),
    };
  };

  const overallMetrics = useMemo(() => {
    if (productionRecords.length === 0) {
      return { availability: 0, performance: 0, quality: 0, oee: 0 };
    }

    const metricsArray = productionRecords.map(record => {
      const machine = machines.find(m => m.id === record.machineId);
      return machine ? calculateOEE(record, machine) : null;
    }).filter(Boolean) as OEEMetrics[];

    if (metricsArray.length === 0) {
      return { availability: 0, performance: 0, quality: 0, oee: 0 };
    }

    const avg = metricsArray.reduce((acc, metrics) => ({
      availability: acc.availability + metrics.availability,
      performance: acc.performance + metrics.performance,
      quality: acc.quality + metrics.quality,
      oee: acc.oee + metrics.oee,
    }), { availability: 0, performance: 0, quality: 0, oee: 0 });

    return {
      availability: avg.availability / metricsArray.length,
      performance: avg.performance / metricsArray.length,
      quality: avg.quality / metricsArray.length,
      oee: avg.oee / metricsArray.length,
    };
  }, [productionRecords, machines]);

  const machinePerformance = useMemo(() => {
    return machines.map(machine => {
      const machineRecords = productionRecords.filter(r => r.machineId === machine.id);
      if (machineRecords.length === 0) {
        return {
          id: machine.id,
          name: machine.name,
          oee: 0,
          availability: 0,
          performance: 0,
          quality: 0,
          recordCount: 0,
        };
      }

      const metricsArray = machineRecords.map(record => calculateOEE(record, machine));
      const avg = metricsArray.reduce((acc, m) => ({
        availability: acc.availability + m.availability,
        performance: acc.performance + m.performance,
        quality: acc.quality + m.quality,
        oee: acc.oee + m.oee,
      }), { availability: 0, performance: 0, quality: 0, oee: 0 });

      const count = metricsArray.length;
      return {
        id: machine.id,
        name: machine.name,
        oee: avg.oee / count,
        availability: avg.availability / count,
        performance: avg.performance / count,
        quality: avg.quality / count,
        recordCount: count,
      };
    });
  }, [machines, productionRecords]);

  const dailyTrend = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = startOfDay(subDays(new Date(), 6 - i));
      return format(date, 'yyyy-MM-dd');
    });

    return last7Days.map((date, index) => {
      const dayRecords = productionRecords.filter(r => r.date === date);
      if (dayRecords.length === 0) {
        return { id: `day-${index}`, date: format(new Date(date), 'MMM dd'), oee: 0, records: 0 };
      }

      const metricsArray = dayRecords.map(record => {
        const machine = machines.find(m => m.id === record.machineId);
        return machine ? calculateOEE(record, machine) : null;
      }).filter(Boolean) as OEEMetrics[];

      const avgOEE = metricsArray.reduce((sum, m) => sum + m.oee, 0) / metricsArray.length;

      return {
        id: `day-${index}`,
        date: format(new Date(date), 'MMM dd'),
        oee: avgOEE,
        records: dayRecords.length,
      };
    });
  }, [productionRecords, machines]);

  const shiftDistribution = useMemo(() => {
    const shifts = { morning: 0, afternoon: 0, night: 0 };
    productionRecords.forEach(record => {
      shifts[record.shift]++;
    });

    return [
      { id: 'shift-morning', name: 'Morning', value: shifts.morning },
      { id: 'shift-afternoon', name: 'Afternoon', value: shifts.afternoon },
      { id: 'shift-night', name: 'Night', value: shifts.night },
    ];
  }, [productionRecords]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  const getOEEColor = (oee: number) => {
    if (oee >= 85) return 'text-green-600';
    if (oee >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const alerts = useMemo(() => {
    const alertList: Array<{ type: 'critical' | 'warning' | 'info'; message: string; icon: React.ReactNode }> = [];

    const maintenanceMachines = machines.filter(m => m.status === 'maintenance');
    const breakdownMachines = machines.filter(m => m.status === 'breakdown');

    if (breakdownMachines.length > 0) {
      alertList.push({
        type: 'critical',
        message: `${breakdownMachines.length} machine(s) in breakdown: ${breakdownMachines.map(m => m.name).join(', ')}`,
        icon: <XCircle className="h-4 w-4" />,
      });
    }

    if (maintenanceMachines.length > 0) {
      alertList.push({
        type: 'warning',
        message: `${maintenanceMachines.length} machine(s) under maintenance: ${maintenanceMachines.map(m => m.name).join(', ')}`,
        icon: <AlertTriangle className="h-4 w-4" />,
      });
    }

    const recentRecords = productionRecords.slice(0, 20);
    const highDowntimeRecords = recentRecords.filter(r => r.downtime > 120);
    if (highDowntimeRecords.length > 0) {
      const uniqueMachines = [...new Set(highDowntimeRecords.map(r => r.machineName))];
      alertList.push({
        type: 'warning',
        message: `High downtime detected (>120 min) on: ${uniqueMachines.join(', ')}`,
        icon: <Clock className="h-4 w-4" />,
      });
    }

    const lowOEEMachines = machinePerformance.filter(m => m.oee < 60 && m.recordCount > 0);
    if (lowOEEMachines.length > 0) {
      alertList.push({
        type: 'warning',
        message: `Low OEE performance (<60%): ${lowOEEMachines.map(m => m.name).join(', ')}`,
        icon: <TrendingUp className="h-4 w-4" />,
      });
    }

    if (overallMetrics.oee >= 85 && alertList.length === 0) {
      alertList.push({
        type: 'info',
        message: 'All systems operating within optimal parameters. Overall OEE exceeds 85% target.',
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
    }

    return alertList;
  }, [machines, productionRecords, machinePerformance, overallMetrics]);

  return (
    <div className="bg-white space-y-6">
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, index) => (
            <Alert
              key={index}
              variant={alert.type === 'critical' ? 'destructive' : 'default'}
              className={
                alert.type === 'critical'
                  ? 'border-red-600 bg-red-50'
                  : alert.type === 'warning'
                    ? 'border-yellow-600 bg-yellow-50'
                    : 'border-green-600 bg-green-50'
              }
            >
              <div className="flex items-center gap-2">
                {alert.icon}
                <AlertTitle className="mb-0">
                  {alert.type === 'critical' ? 'Critical Alert' : alert.type === 'warning' ? 'Warning' : 'System Status'}
                </AlertTitle>
              </div>
              <AlertDescription className="mt-2">{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall OEE</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getOEEColor(overallMetrics.oee)}`}>
              {overallMetrics.oee.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              {productionRecords.length} total records
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Availability</CardTitle>
            <Activity className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {overallMetrics.availability.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Uptime efficiency
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <TrendingUp className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {overallMetrics.performance.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Speed efficiency
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quality</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-slate-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {overallMetrics.quality.toFixed(1)}%
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Good parts ratio
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>OEE Trend (Last 7 Days)</CardTitle>
            <CardDescription>Daily OEE performance tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <RechartsTooltip />
                <Legend />
                <Line
                  key="oee-trend-line"
                  type="monotone"
                  dataKey="oee"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="OEE %"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Machine Performance Comparison</CardTitle>
            <CardDescription>OEE by machine</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={machinePerformance}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-15} textAnchor="end" height={80} />
                <YAxis domain={[0, 100]} />
                <RechartsTooltip />
                <Legend />
                <Bar key="machine-oee-bar" dataKey="oee" fill="#3b82f6" name="OEE %" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>OEE Components Breakdown</CardTitle>
            <CardDescription>Average performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { id: 'availability', metric: 'Availability', value: overallMetrics.availability },
                  { id: 'performance', metric: 'Performance', value: overallMetrics.performance },
                  { id: 'quality', metric: 'Quality', value: overallMetrics.quality },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric" />
                <YAxis domain={[0, 100]} />
                <RechartsTooltip />
                <Bar key="oee-components-bar" dataKey="value" name="Percentage">
                  <Cell key="availability" fill={COLORS[0]} />
                  <Cell key="performance" fill={COLORS[1]} />
                  <Cell key="quality" fill={COLORS[2]} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Shift Distribution</CardTitle>
            <CardDescription>Production records by shift</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  key="shift-distribution-pie"
                  data={shiftDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={100}
                  dataKey="value"
                >
                  {shiftDistribution.map((entry) => (
                    <Cell key={entry.id} fill={COLORS[shiftDistribution.indexOf(entry) % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {productionRecords.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-600 text-center">
              No production data available yet.
              <br />
              Start by adding production records in the Data Entry tab.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

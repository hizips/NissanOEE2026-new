import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Machine, ProductionRecord, OEEMetrics, Part, PartProductionHistory, DowntimeEventHistory } from '@/types';
import { calculateOEEMetrics } from '@/utils/oee';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Activity, CheckCircle2, AlertCircle, AlertTriangle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { eachDayOfInterval, format, parseISO, subDays } from 'date-fns';

interface DashboardProps {
  machines: Machine[];
  productionRecords: ProductionRecord[];
  parts: Part[];
  partProductionHistory: PartProductionHistory[];
  downtimeEventHistory: DowntimeEventHistory[];
  availableDateRange: { min: string; max: string };
  onRequestDateRange: (start: string, end: string) => void | Promise<void>;
}

const dateInputClassName = 'h-9 rounded-md border border-slate-300 bg-white px-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

interface DateRangeValue {
  start: string;
  end: string;
}

function DateRangeSelector({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  min?: string;
  max: string;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        From
        <input
          aria-label={`${label} start date`}
          type="date"
          value={value.start}
          min={min}
          max={value.end}
          onChange={event => {
            const start = event.target.value;
            if (!start) return;
            onChange({ start, end: start > value.end ? start : value.end });
          }}
          className={dateInputClassName}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        To
        <input
          aria-label={`${label} end date`}
          type="date"
          value={value.end}
          min={value.start}
          max={max}
          onChange={event => {
            const end = event.target.value;
            if (!end) return;
            onChange({ start: end < value.start ? end : value.start, end });
          }}
          className={dateInputClassName}
        />
      </label>
    </div>
  );
}

function SingleDateSelector({
  value,
  onChange,
  min,
  max,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max: string;
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      Date
      <input
        aria-label={label}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={event => {
          if (event.target.value) onChange(event.target.value);
        }}
        className={dateInputClassName}
      />
    </label>
  );
}

function CollapsibleChartCard({
  title,
  description,
  controls,
  children,
}: {
  title: string;
  description: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-2">
            {controls}
            <CollapsibleTrigger asChild>
              <button
                type="button"
                aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function buildParetoData(items: Array<{ name: string; value: number }>, categoryLimit = 10) {
  const totals = new Map<string, number>();
  items.forEach(item => totals.set(item.name, (totals.get(item.name) || 0) + item.value));

  const sorted = [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const displayed = sorted.length > categoryLimit
    ? [
        ...sorted.slice(0, categoryLimit - 1),
        {
          name: 'Other',
          value: sorted.slice(categoryLimit - 1).reduce((sum, item) => sum + item.value, 0),
        },
      ]
    : sorted;

  return displayed;
}

function downtimeParetoLabel(reason: DowntimeEventHistory['reason'] | undefined) {
  const fullLabel = reason?.fullPath || reason?.category || 'Unspecified';
  const pathSegments = fullLabel
    .split(/\s*(?:>|→)\s*/)
    .map(segment => segment.trim())
    .filter(Boolean);

  return pathSegments[pathSegments.length - 1] || 'Unspecified';
}

function averageMetrics(
  records: ProductionRecord[],
  machines: Machine[],
  parts: Part[],
  partProductionHistory: PartProductionHistory[],
): OEEMetrics {
  const metrics = records.map(record => {
    const machine = machines.find(item => item.id === record.machineId);
    return machine ? calculateOEEMetrics(record, machine, parts, partProductionHistory) : null;
  }).filter(Boolean) as OEEMetrics[];

  if (metrics.length === 0) {
    return { availability: 0, performance: 0, quality: 0, oee: 0 };
  }

  const totals = metrics.reduce((acc, item) => ({
    availability: acc.availability + item.availability,
    performance: acc.performance + item.performance,
    quality: acc.quality + item.quality,
    oee: acc.oee + item.oee,
  }), { availability: 0, performance: 0, quality: 0, oee: 0 });

  return {
    availability: totals.availability / metrics.length,
    performance: totals.performance / metrics.length,
    quality: totals.quality / metrics.length,
    oee: totals.oee / metrics.length,
  };
}

function metricsByMachine(
  machines: Machine[],
  records: ProductionRecord[],
  parts: Part[],
  partProductionHistory: PartProductionHistory[],
) {
  return machines.map(machine => {
    const machineRecords = records.filter(record => record.machineId === machine.id);
    const averages = averageMetrics(machineRecords, [machine], parts, partProductionHistory);

    return {
      id: machine.id,
      name: machine.name,
      ...averages,
      recordCount: machineRecords.length,
    };
  });
}

export function Dashboard({
  machines,
  productionRecords,
  parts,
  partProductionHistory,
  downtimeEventHistory,
  availableDateRange,
  onRequestDateRange,
}: DashboardProps) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const dateInputMax = availableDateRange.max > today ? availableDateRange.max : today;
  const defaultRange = { start: format(subDays(new Date(), 6), 'yyyy-MM-dd'), end: today };
  const [trendRange, setTrendRange] = useState<DateRangeValue>(defaultRange);
  const [downtimeRange, setDowntimeRange] = useState<DateRangeValue>(defaultRange);
  const [defectRange, setDefectRange] = useState<DateRangeValue>(defaultRange);
  const [componentTrendRange, setComponentTrendRange] = useState<DateRangeValue>(defaultRange);
  const [machineDate, setMachineDate] = useState(today);
  const [componentsDate, setComponentsDate] = useState(today);
  const [shiftDate, setShiftDate] = useState(today);

  const todayRecords = useMemo(
    () => productionRecords.filter(record => record.date === today),
    [productionRecords, today],
  );
  const machineDateRecords = useMemo(
    () => productionRecords.filter(record => record.date === machineDate),
    [productionRecords, machineDate],
  );
  const componentsDateRecords = useMemo(
    () => productionRecords.filter(record => record.date === componentsDate),
    [productionRecords, componentsDate],
  );
  const shiftDateRecords = useMemo(
    () => productionRecords.filter(record => record.date === shiftDate),
    [productionRecords, shiftDate],
  );

  const overallMetrics = useMemo(
    () => averageMetrics(todayRecords, machines, parts, partProductionHistory),
    [todayRecords, machines, parts, partProductionHistory],
  );
  const componentMetrics = useMemo(
    () => averageMetrics(componentsDateRecords, machines, parts, partProductionHistory),
    [componentsDateRecords, machines, parts, partProductionHistory],
  );
  const machinePerformance = useMemo(
    () => metricsByMachine(machines, machineDateRecords, parts, partProductionHistory),
    [machines, machineDateRecords, parts, partProductionHistory],
  );
  const todayMachinePerformance = useMemo(
    () => metricsByMachine(machines, todayRecords, parts, partProductionHistory),
    [machines, todayRecords, parts, partProductionHistory],
  );

  const dailyTrend = useMemo(() => {
    const rangeDates = eachDayOfInterval({
      start: parseISO(trendRange.start),
      end: parseISO(trendRange.end),
    }).map(date => format(date, 'yyyy-MM-dd'));

    return rangeDates.map((date, index) => {
      const dayRecords = productionRecords.filter(r => r.date === date);
      if (dayRecords.length === 0) {
        return { id: `day-${index}`, date: format(parseISO(date), 'MMM dd'), oee: 0, records: 0 };
      }

      const avgOEE = averageMetrics(dayRecords, machines, parts, partProductionHistory).oee;

      return {
        id: `day-${index}`,
        date: format(parseISO(date), 'MMM dd'),
        oee: avgOEE,
        records: dayRecords.length,
      };
    });
  }, [trendRange, productionRecords, machines, parts, partProductionHistory]);

  const downtimePareto = useMemo(() => buildParetoData(
    downtimeEventHistory
      .filter(event => event.date >= downtimeRange.start && event.date <= downtimeRange.end)
      .map(event => ({
        name: downtimeParetoLabel(event.reason),
        value: event.duration,
      })),
  ), [downtimeEventHistory, downtimeRange]);

  const defectPareto = useMemo(() => buildParetoData(
    partProductionHistory
      .filter(record => (
        record.date >= defectRange.start
        && record.date <= defectRange.end
        && record.result === 'NOT GOOD'
      ))
      .map(record => ({
        name: record.defectSpecificReason
          || record.defectSubcategory
          || record.defectCategory
          || 'Unspecified',
        value: 1,
      })),
  ), [partProductionHistory, defectRange]);

  const componentTrend = useMemo(() => {
    const rangeDates = eachDayOfInterval({
      start: parseISO(componentTrendRange.start),
      end: parseISO(componentTrendRange.end),
    });

    return rangeDates.map(date => {
      const dateKey = format(date, 'yyyy-MM-dd');
      const records = productionRecords.filter(record => record.date === dateKey);
      return {
        date: format(date, 'MMM dd'),
        ...averageMetrics(records, machines, parts, partProductionHistory),
      };
    });
  }, [componentTrendRange, productionRecords, machines, parts, partProductionHistory]);

  const shiftDistribution = useMemo(() => {
    const shifts = { morning: 0, afternoon: 0, night: 0 };
    shiftDateRecords.forEach(record => {
      shifts[record.shift]++;
    });

    return [
      { id: 'shift-morning', name: 'Morning', value: shifts.morning },
      { id: 'shift-afternoon', name: 'Afternoon', value: shifts.afternoon },
      { id: 'shift-night', name: 'Night', value: shifts.night },
    ];
  }, [shiftDateRecords]);

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

    const recentRecords = todayRecords.slice(0, 20);
    const highDowntimeRecords = recentRecords.filter(r => r.downtime > 120);
    if (highDowntimeRecords.length > 0) {
      const uniqueMachines = [...new Set(highDowntimeRecords.map(r => r.machineName))];
      alertList.push({
        type: 'warning',
        message: `High downtime detected (>120 min) on: ${uniqueMachines.join(', ')}`,
        icon: <Clock className="h-4 w-4" />,
      });
    }

    const lowOEEMachines = todayMachinePerformance.filter(m => m.oee < 60 && m.recordCount > 0);
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
  }, [machines, todayRecords, todayMachinePerformance, overallMetrics]);

  const todayLabel = format(parseISO(today), 'MMM dd, yyyy');
  const machineDateLabel = format(parseISO(machineDate), 'MMM dd, yyyy');
  const componentsDateLabel = format(parseISO(componentsDate), 'MMM dd, yyyy');
  const shiftDateLabel = format(parseISO(shiftDate), 'MMM dd, yyyy');

  return (
    <div className="space-y-6 w-full">
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
              {todayRecords.length} record(s) today
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
        <CollapsibleChartCard
          title="OEE Trend"
          description="Daily average OEE across the selected range"
          controls={(
            <DateRangeSelector
              value={trendRange}
              onChange={value => {
                setTrendRange(value);
                void onRequestDateRange(value.start, value.end);
              }}
              min={availableDateRange.min || undefined}
              max={dateInputMax}
              label="OEE trend"
            />
          )}
        >
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <RechartsTooltip />
              <Legend />
              <Line type="monotone" dataKey="oee" stroke="#3b82f6" strokeWidth={2} name="OEE %" />
            </LineChart>
          </ResponsiveContainer>
        </CollapsibleChartCard>

        <CollapsibleChartCard
          title="Machine Performance Comparison"
          description={`OEE by machine on ${machineDateLabel}`}
          controls={(
            <SingleDateSelector
              value={machineDate}
              onChange={value => {
                setMachineDate(value);
                void onRequestDateRange(value, value);
              }}
              min={availableDateRange.min || undefined}
              max={dateInputMax}
              label="Machine performance date"
            />
          )}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={machinePerformance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-15} textAnchor="end" height={80} />
              <YAxis domain={[0, 100]} />
              <RechartsTooltip />
              <Legend />
              <Bar dataKey="oee" fill="#3b82f6" name="OEE %" />
            </BarChart>
          </ResponsiveContainer>
        </CollapsibleChartCard>

        <CollapsibleChartCard
          title="OEE Components Breakdown"
          description={`Average metrics on ${componentsDateLabel}`}
          controls={(
            <SingleDateSelector
              value={componentsDate}
              onChange={value => {
                setComponentsDate(value);
                void onRequestDateRange(value, value);
              }}
              min={availableDateRange.min || undefined}
              max={dateInputMax}
              label="OEE components date"
            />
          )}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={[
                { id: 'availability', metric: 'Availability', value: componentMetrics.availability },
                { id: 'performance', metric: 'Performance', value: componentMetrics.performance },
                { id: 'quality', metric: 'Quality', value: componentMetrics.quality },
              ]}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="metric" />
              <YAxis domain={[0, 100]} />
              <RechartsTooltip />
              <Bar dataKey="value" name="Percentage">
                <Cell key="availability" fill={COLORS[0]} />
                <Cell key="performance" fill={COLORS[1]} />
                <Cell key="quality" fill={COLORS[2]} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CollapsibleChartCard>

        <CollapsibleChartCard
          title="Shift Distribution"
          description={`Production records by shift on ${shiftDateLabel}`}
          controls={(
            <SingleDateSelector
              value={shiftDate}
              onChange={value => {
                setShiftDate(value);
                void onRequestDateRange(value, value);
              }}
              min={availableDateRange.min || undefined}
              max={dateInputMax}
              label="Shift distribution date"
            />
          )}
        >
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={shiftDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                dataKey="value"
              >
                {shiftDistribution.map((entry, index) => (
                  <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </CollapsibleChartCard>

        <CollapsibleChartCard
          title="Downtime Pareto"
          description="Downtime minutes by reason, ordered from highest to lowest"
          controls={(
            <DateRangeSelector
              value={downtimeRange}
              onChange={value => {
                setDowntimeRange(value);
                void onRequestDateRange(value.start, value.end);
              }}
              min={availableDateRange.min || undefined}
              max={dateInputMax}
              label="Downtime Pareto"
            />
          )}
        >
          {downtimePareto.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={downtimePareto}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-25} textAnchor="end" height={110} interval={0} />
                <YAxis />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="value" fill="#f59e0b" name="Downtime minutes" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
              No downtime events in the selected range.
            </div>
          )}
        </CollapsibleChartCard>

        <CollapsibleChartCard
          title="Defect Pareto"
          description="Rejected parts by defect reason, ordered from highest to lowest"
          controls={(
            <DateRangeSelector
              value={defectRange}
              onChange={value => {
                setDefectRange(value);
                void onRequestDateRange(value.start, value.end);
              }}
              min={availableDateRange.min || undefined}
              max={dateInputMax}
              label="Defect Pareto"
            />
          )}
        >
          {defectPareto.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={defectPareto}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-25} textAnchor="end" height={110} interval={0} />
                <YAxis allowDecimals={false} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="value" fill="#ef4444" name="Rejected parts" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
              No rejected parts in the selected range.
            </div>
          )}
        </CollapsibleChartCard>

        <CollapsibleChartCard
          title="OEE Component Trend"
          description="Availability, performance, quality, and OEE over time"
          controls={(
            <DateRangeSelector
              value={componentTrendRange}
              onChange={value => {
                setComponentTrendRange(value);
                void onRequestDateRange(value.start, value.end);
              }}
              min={availableDateRange.min || undefined}
              max={dateInputMax}
              label="OEE component trend"
            />
          )}
        >
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={componentTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <RechartsTooltip />
              <Legend />
              <Line type="monotone" dataKey="availability" stroke="#3b82f6" strokeWidth={2} name="Availability %" />
              <Line type="monotone" dataKey="performance" stroke="#8b5cf6" strokeWidth={2} name="Performance %" />
              <Line type="monotone" dataKey="quality" stroke="#10b981" strokeWidth={2} name="Quality %" />
              <Line type="monotone" dataKey="oee" stroke="#0f172a" strokeWidth={3} name="OEE %" />
            </LineChart>
          </ResponsiveContainer>
        </CollapsibleChartCard>
      </div>

      {todayRecords.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-slate-400 mb-4" />
            <p className="text-slate-600 text-center">
              No production data available for today, {todayLabel}.
              <br />
              The summary cards remain at zero; use the chart selectors to inspect another date.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

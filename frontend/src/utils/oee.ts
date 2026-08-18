import type { Machine, Part, ProductionRecord, PartProductionHistory, OEEMetrics } from '@/types';
import { matchesShiftRecord } from '@/utils/ocrRecordUtils';

/**
 * Resolve the effective cycle time (minutes/part) for a shift record.
 * 1. Weighted average from part production history rows for that shift
 * 2. Average of the machine's supported part cycle times
 */
export function getCycleTimeForShift(
  record: ProductionRecord,
  machine: Machine,
  parts: Part[],
  partProductionHistory: PartProductionHistory[] = [],
): number | null {
  const partsById = new Map(parts.map(p => [String(p.id), p]));

  const shiftParts = partProductionHistory.filter(p => matchesShiftRecord(record, p));

  if (shiftParts.length > 0) {
    const counts = new Map<string, number>();
    for (const entry of shiftParts) {
      const partId = entry.partId ? String(entry.partId) : '';
      if (!partId) continue;
      counts.set(partId, (counts.get(partId) || 0) + 1);
    }

    let weightedCycle = 0;
    let totalWeight = 0;
    counts.forEach((count, partId) => {
      const part = partsById.get(partId);
      if (part && part.cycleTime > 0) {
        weightedCycle += part.cycleTime * count;
        totalWeight += count;
      }
    });
    if (totalWeight > 0) return weightedCycle / totalWeight;
  }

  const supportedParts = (machine.supportedParts || [])
    .map(id => partsById.get(String(id)))
    .filter((p): p is Part => !!p && p.cycleTime > 0);

  if (supportedParts.length === 0) return null;
  return supportedParts.reduce((sum, p) => sum + p.cycleTime, 0) / supportedParts.length;
}

export function calculateOEEMetrics(
  record: ProductionRecord,
  machine: Machine,
  parts: Part[],
  partProductionHistory: PartProductionHistory[] = [],
): OEEMetrics {
  const operatingTime = record.plannedProductionTime - record.downtime;
  const cycleTime = getCycleTimeForShift(record, machine, parts, partProductionHistory);

  const availability = record.plannedProductionTime > 0
    ? (operatingTime / record.plannedProductionTime) * 100
    : 0;

  const performance = operatingTime > 0 && cycleTime != null
    ? ((cycleTime * record.totalCount) / operatingTime) * 100
    : 0;

  const quality = record.totalCount > 0
    ? (record.goodCount / record.totalCount) * 100
    : 0;

  const oee = (availability * performance * quality) / 10000;

  return {
    availability: Math.min(availability, 100),
    performance: Math.min(performance, 100),
    quality: Math.min(quality, 100),
    oee: Math.min(oee, 100),
  };
}

export function calculateOEEPercent(
  record: ProductionRecord,
  machine: Machine,
  parts: Part[],
  partProductionHistory: PartProductionHistory[] = [],
): number {
  return calculateOEEMetrics(record, machine, parts, partProductionHistory).oee;
}

import type { ReadinessReport } from '../model/report.js';

export function renderJson(report: ReadinessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

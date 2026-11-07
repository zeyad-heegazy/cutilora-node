import type { Request, Response, NextFunction } from 'express';
import { querySchema } from '../validation/tenant-reports.validation.js';
import { tenantReportsService } from '../services/tenant-reports.service.js';

function rows(report: any) {
  const result: Array<{ section: string; metric: string; value: string }> = [];
  const flatten = (section: string, value: any, prefix = '') => {
    for (const [key, item] of Object.entries(value ?? {})) {
      const metric = prefix ? `${prefix}.${key}` : key;
      if (item && typeof item === 'object' && !Array.isArray(item)) flatten(section, item, metric);
      else result.push({ section, metric, value: Array.isArray(item) ? JSON.stringify(item) : String(item ?? '') });
    }
  };
  result.push({ section: 'metadata', metric: 'generatedAt', value: report.generatedAt });
  result.push({ section: 'metadata', metric: 'timezone', value: report.timezone });
  result.push({ section: 'metadata', metric: 'freshness', value: report.freshness });
  flatten('definitions', report.definitions);
  for (const section of ['clinics', 'branches', 'memberships', 'invitations']) flatten(section, report[section]);
  for (const item of report.topAuditActions) result.push({ section: 'audit', metric: item.action, value: String(item.count) });
  return result;
}
export const tenantReportsController = {
  async organizationOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const query = querySchema.parse(req.query);
      const data = await tenantReportsService.organizationOverview(req.tenantContext!.tenantId, query);
      res.json({ success: true, data });
    } catch (error) { next(error); }
  },
  async exportOrganizationOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const query = querySchema.parse(req.query);
      const report = await tenantReportsService.organizationOverview(req.tenantContext!.tenantId, query);
      const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';
      const csv = [
        ['section', 'metric', 'value'].join(','),
        ...rows(report).map(row => [row.section, row.metric, row.value].map(quote).join(',')),
      ].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tenant-organization-report.csv"');
      res.setHeader('X-Report-Generated-At', report.generatedAt);
      res.setHeader('X-Report-Timezone', report.timezone);
      res.setHeader('X-Report-Freshness', 'live');
      res.send(csv);
    } catch (error) { next(error); }
  },
};

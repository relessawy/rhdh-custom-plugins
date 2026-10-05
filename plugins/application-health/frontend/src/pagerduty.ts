import type {CardData} from './Overview';

export function pagerDutyCard(service: any, incidents: any, users: any, href?: string): CardData {
  if (!service?.id || !Array.isArray(incidents) || !Array.isArray(users)) {
    throw Error('Invalid PagerDuty response');
  }
  if (incidents.some((i: any) => !['triggered', 'acknowledged', 'resolved'].includes(i.status))) {
    throw Error('Unknown PagerDuty incident status');
  }
  const open = incidents.filter((i: any) => i.status !== 'resolved');
  return {
    status: open.length ? `${open.length} open incident${open.length === 1 ? '' : 's'}` : 'No open incidents returned',
    detail: 'Last 30 days · native PagerDuty results',
    observedAt: new Date().toISOString(),
    bullets: [
      'Window: Last 30 days (native results)',
      `Service: ${service.name || service.id}`,
      `Triggered: ${open.filter((i: any) => i.status === 'triggered').length}`,
      `Acknowledged: ${open.filter((i: any) => i.status === 'acknowledged').length}`,
      `On call: ${[...new Set(users.map((u: any) => u.name || u.summary).filter(Boolean))].join(', ') || 'Not assigned'}`,
    ], href,
  };
}

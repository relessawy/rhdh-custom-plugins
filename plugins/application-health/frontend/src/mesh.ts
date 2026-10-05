import type {CardData} from './Overview';

export function meshCard(namespace: string, data: any, tls: any, href?: string): CardData {
  if (!Array.isArray(data?.workloads) || typeof tls?.autoMTLSEnabled !== 'boolean') {
    throw Error('Invalid Kiali response');
  }
  const meshed = data.workloads.filter((w: any) => w.istioSidecar === true);
  return {
    status: meshed.length ? `${meshed.length} meshed workloads` : 'No sidecars reported',
    detail: 'Namespace view · open Service Mesh for traffic and workload details.',
    observedAt: new Date().toISOString(),
    bullets: [`Namespace: ${namespace}`, `Discovered workloads: ${data.workloads.length}`,
      `Automatic mTLS: ${tls.autoMTLSEnabled ? 'enabled' : 'disabled'}`,
      `TLS policy: ${tls.status || 'unknown'}`], href,
  };
}

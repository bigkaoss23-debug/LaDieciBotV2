import { useEffect, useState } from 'react';
import { api } from '../../api';
import { CONTRACT_V1 } from '../../utils/uiOffset';

// [FDV1 R3] Contratto ± letto UNA volta dal backend. BE senza `priorityContract` (versione LIVE precedente) →
// contratto v1 (±30): il FE non propone mai valori che il backend clamperebbe in silenzio.
let cached = null;
let inflight = null;

export const normalizeContract = (res) => {
  const c = res && res.ok && res.contract;
  if (!c || !(Number(c.version) >= 2)) return CONTRACT_V1;
  const max = Number(c.max), min = Number(c.min), margin = Number(c.margin_min);
  if (!Number.isFinite(max) || !Number.isFinite(min)) return CONTRACT_V1;
  return Object.freeze({ version: Number(c.version), min, max, margin_min: Number.isFinite(margin) ? margin : CONTRACT_V1.margin_min });
};

export const loadPriorityContract = () => {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = Promise.resolve()
      .then(() => api.priorityContract && api.priorityContract())
      .then((res) => { cached = normalizeContract(res); return cached; })
      .catch(() => CONTRACT_V1)
      .finally(() => { inflight = null; });
  }
  return inflight;
};

export const __resetPriorityContractCache = () => { cached = null; inflight = null; };

export default function usePriorityContract() {
  const [contract, setContract] = useState(cached || CONTRACT_V1);
  useEffect(() => {
    let alive = true;
    loadPriorityContract().then((c) => { if (alive) setContract(c); });
    return () => { alive = false; };
  }, []);
  return contract;
}

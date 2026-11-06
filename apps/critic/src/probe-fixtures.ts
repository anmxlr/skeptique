import type { TestCase } from '@skeptic/shared';

export const recordedProbeCases: TestCase[] = [
  { id: 'probe-meter-3m', input: { value: 3, from: 'm', to: 'cm' }, expect: { kind: 'exact', value: { result: 300, unit: 'cm' } }, weight: 1 },
  { id: 'probe-km-2_5', input: { value: 2.5, from: 'km', to: 'm' }, expect: { kind: 'exact', value: { result: 2500, unit: 'm' } }, weight: 1 },
  { id: 'probe-cm-100', input: { value: 100, from: 'cm', to: 'm' }, expect: { kind: 'exact', value: { result: 1, unit: 'm' } }, weight: 1 },
  { id: 'probe-kg-10', input: { value: 10, from: 'kg', to: 'g' }, expect: { kind: 'exact', value: { result: 10000, unit: 'g' } }, weight: 1 },
  { id: 'probe-temp-20c', input: { value: 20, from: 'C', to: 'F' }, expect: { kind: 'exact', value: { result: 68, unit: 'F' } }, weight: 1 },
  { id: 'probe-volume-3l', input: { value: 3, from: 'L', to: 'mL' }, expect: { kind: 'exact', value: { result: 3000, unit: 'mL' } }, weight: 1 },
  { id: 'probe-foot-cm', input: { value: 1, from: 'ft', to: 'cm' }, expect: { kind: 'exact', value: { result: 30.48, unit: 'cm' } }, weight: 1 },
  { id: 'probe-mile-km', input: { value: 8, from: 'mi', to: 'km' }, expect: { kind: 'exact', value: { result: 12.874752, unit: 'km' } }, weight: 1 },
  { id: 'probe-pound-kg', input: { value: 8, from: 'lb', to: 'kg' }, expect: { kind: 'exact', value: { result: 3.62873896, unit: 'kg' } }, weight: 1 },
  { id: 'probe-mm-meter', input: { value: 1000, from: 'mm', to: 'm' }, expect: { kind: 'exact', value: { result: 1, unit: 'm' } }, weight: 1 },
  { id: 'probe-meter-foot', input: { value: 15, from: 'm', to: 'ft' }, expect: { kind: 'exact', value: { result: 49.21259843, unit: 'ft' } }, weight: 1 },
];

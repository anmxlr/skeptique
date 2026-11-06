import { suiteHash, type TestSuite } from 'shared';

export type UnitConvertInput = { value: number; from: string; to: string; format?: 'object' | 'text' };
export type UnitConvertOutput = { result: number; unit: string };

const units: Record<string, { group: string; factor: number }> = {
  m: { group: 'length', factor: 1 }, cm: { group: 'length', factor: 0.01 }, km: { group: 'length', factor: 1000 }, mm: { group: 'length', factor: 0.001 },
  in: { group: 'length', factor: 0.0254 }, ft: { group: 'length', factor: 0.3048 }, mi: { group: 'length', factor: 1609.344 },
  g: { group: 'mass', factor: 1 }, kg: { group: 'mass', factor: 1000 }, lb: { group: 'mass', factor: 453.59237 },
  L: { group: 'volume', factor: 1 }, mL: { group: 'volume', factor: 0.001 },
};

function round(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Conversion result must be finite');
  if (Math.abs(value) >= 1e21) return value;
  return Math.round((value + Number.EPSILON) * 1e8) / 1e8;
}

function convertTemperature(value: number, from: string, to: string): number | undefined {
  if (!['C', 'F', 'K'].includes(from) || !['C', 'F', 'K'].includes(to)) return undefined;
  const celsius = from === 'C' ? value : from === 'F' ? (value - 32) * 5 / 9 : value - 273.15;
  return round(to === 'C' ? celsius : to === 'F' ? celsius * 9 / 5 + 32 : celsius + 273.15);
}

export async function handleUnitConvert(input: unknown): Promise<UnitConvertOutput | string> {
  if (!input || typeof input !== 'object') throw new Error('Input must be an object');
  const value = input as Partial<UnitConvertInput>;
  if (typeof value.value !== 'number' || !Number.isFinite(value.value) || typeof value.from !== 'string' || typeof value.to !== 'string') {
    throw new Error('Expected finite value, from unit, and to unit');
  }

  let result = convertTemperature(value.value, value.from, value.to);
  if (result === undefined) {
    const from = Object.hasOwn(units, value.from) ? units[value.from] : undefined;
    const to = Object.hasOwn(units, value.to) ? units[value.to] : undefined;
    if (!from || !to || from.group !== to.group) throw new Error(`Unsupported conversion: ${value.from} to ${value.to}`);
    result = round(value.value * (from.factor / to.factor));
  }
  return value.format === 'text' ? `${result} ${value.to}` : { result, unit: value.to };
}

export const unitConvertSuite: TestSuite = {
  version: 1, serviceName: 'unit-convert', category: 'conversion', determinism: 'none',
  cases: [
    { id: 'm-to-cm', input: { value: 2, from: 'm', to: 'cm' }, expect: { kind: 'exact', value: { result: 200, unit: 'cm' } }, weight: 1 },
    { id: 'km-to-m', input: { value: 1.5, from: 'km', to: 'm' }, expect: { kind: 'exact', value: { result: 1500, unit: 'm' } }, weight: 1 },
    { id: 'kg-to-g', input: { value: 1.25, from: 'kg', to: 'g' }, expect: { kind: 'exact', value: { result: 1250, unit: 'g' } }, weight: 1 },
    { id: 'ft-to-in', input: { value: 12, from: 'in', to: 'ft' }, expect: { kind: 'exact', value: { result: 1, unit: 'ft' } }, weight: 1 },
    { id: 'f-to-c', input: { value: 32, from: 'F', to: 'C' }, expect: { kind: 'exact', value: { result: 0, unit: 'C' } }, weight: 1 },
    { id: 'c-to-f', input: { value: 0, from: 'C', to: 'F' }, expect: { kind: 'exact', value: { result: 32, unit: 'F' } }, weight: 1 },
    { id: 'l-to-ml', input: { value: 1.5, from: 'L', to: 'mL' }, expect: { kind: 'exact', value: { result: 1500, unit: 'mL' } }, weight: 1 },
    { id: 'mm-to-m', input: { value: 250, from: 'mm', to: 'm' }, expect: { kind: 'exact', value: { result: 0.25, unit: 'm' } }, weight: 1 },
    { id: 'negative-temperature', input: { value: -40, from: 'C', to: 'F' }, expect: { kind: 'exact', value: { result: -40, unit: 'F' } }, weight: 1 },
    { id: 'schema-shape', input: { value: 4, from: 'cm', to: 'm' }, expect: { kind: 'schema', schema: { type: 'object', required: ['result', 'unit'], properties: { result: { type: 'number' }, unit: { type: 'string' } }, additionalProperties: false } }, weight: 1 },
    { id: 'kelvin-judge', input: { value: 273.15, from: 'K', to: 'C' }, expect: { kind: 'judge', rubric: 'Check that the returned conversion equals zero Celsius within 1e-8.' }, weight: 1 },
    { id: 'text-format', input: { value: 2, from: 'm', to: 'cm', format: 'text' }, expect: { kind: 'regex', pattern: '^200 cm$' }, weight: 1 },
  ],
};
export const unitConvertSpecHash = suiteHash(unitConvertSuite);

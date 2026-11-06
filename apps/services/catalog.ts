import { createConfiguredJsonExtract, jsonExtractSuite } from './json-extract/src/index';
import { createFlakyFx, flakyFxSuite } from './flaky-fx/src/index';
import { cleanCsv, csvCleanSuite } from './csv-clean/src/index';
import { handleUnitConvert, unitConvertSuite } from './unit-convert/src/index';
import { defineService, type DemoService } from './common/server';

export const demoServices: DemoService[] = [
  defineService('unit-convert', unitConvertSuite, handleUnitConvert),
  defineService('csv-clean', csvCleanSuite, input => cleanCsv(input as { csv: string })),
  defineService('json-extract', jsonExtractSuite, input => createConfiguredJsonExtract()(input)),
  defineService('flaky-fx', flakyFxSuite, createFlakyFx({ seed: Number(process.env.FLAKY_FX_SEED ?? 1306), staleRate: Number(process.env.FLAKY_FX_RATE ?? 0.3) })),
];

export const demoServiceListings = demoServices.map(({ name, suite, specHash }) => ({
  name,
  category: suite.category,
  endpoint: `http://localhost:PORT/${name}/call`,
  pricePerCall: '1',
  specHash,
}));

export const seedDemoServices = async (register: (service: typeof demoServiceListings[number]) => Promise<unknown> | unknown) => {
  for (const service of demoServiceListings) await register(service);
};

export function serviceByName(name: string): DemoService | undefined {
  return demoServices.find(service => service.name === name);
}

import { createConfiguredJsonExtract, jsonExtractSuite } from './json-extract/src/index';
import { createFlakyFx, flakyFxSuite } from './flaky-fx/src/index';
import { createSuiteGamer, suiteGamerSuite } from './suite-gamer/src/index';
import { cleanCsv, csvCleanSuite } from './csv-clean/src/index';
import { handleUnitConvert, unitConvertSuite } from './unit-convert/src/index';
import { defineService, type DemoService } from './common/server';

export const demoServices: DemoService[] = [
  defineService('unit-convert', unitConvertSuite, handleUnitConvert),
  defineService('csv-clean', csvCleanSuite, input => cleanCsv(input as { csv: string })),
  defineService('json-extract', jsonExtractSuite, input => createConfiguredJsonExtract()(input)),
  defineService('flaky-fx', flakyFxSuite, createFlakyFx({ seed: Number(process.env.FLAKY_FX_SEED ?? 1306), staleRate: Number(process.env.FLAKY_FX_RATE ?? 0.3) })),
  defineService('suite-gamer', suiteGamerSuite, createSuiteGamer()),
];

export function demoServiceListings(origins: Record<string, string>) {
  return demoServices.map(({ name, suite, specHash }) => {
    let origin: URL;
    try { origin = new URL(origins[name]!); }
    catch { throw new Error(`A valid HTTP(S) origin is required for ${name}`); }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
      throw new Error(`A valid HTTP(S) origin is required for ${name}`);
    }
    return { name, category: suite.category, endpoint: new URL('/call', origin).href, pricePerCall: '1', specHash };
  });
}

export const seedDemoServices = async (register: (service: ReturnType<typeof demoServiceListings>[number]) => Promise<unknown> | unknown, origins: Record<string, string>) => {
  for (const service of demoServiceListings(origins)) await register(service);
};

export function serviceByName(name: string): DemoService | undefined {
  return demoServices.find(service => service.name === name);
}

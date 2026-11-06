import type { TestCase } from "@skeptique/shared";

// Held-out probe seeds, one file for every demo service. Only tests import this: probes must stay out of
// product paths and out of the public suites, so no input below appears in a published suite.
export const heldOutProbeSeeds: Record<string, TestCase[]> = {
  "unit-convert": [
    {
      id: "h-m-km",
      input: { value: 7500, from: "m", to: "km" },
      expect: { kind: "exact", value: { result: 7.5, unit: "km" } },
      weight: 1,
    },
    {
      id: "h-g-kg",
      input: { value: 2500, from: "g", to: "kg" },
      expect: { kind: "exact", value: { result: 2.5, unit: "kg" } },
      weight: 1,
    },
    {
      id: "h-c-f",
      input: { value: 37, from: "C", to: "F" },
      expect: { kind: "exact", value: { result: 98.6, unit: "F" } },
      weight: 1,
    },
    {
      id: "h-zero",
      input: { value: 0, from: "km", to: "m" },
      expect: { kind: "exact", value: { result: 0, unit: "m" } },
      weight: 1,
    },
  ],
  "csv-clean": [
    { id: "h-pad", input: { csv: "  x ,y\n 9 , 8 " }, expect: { kind: "exact", value: "x,y\n9,8" }, weight: 1 },
    {
      id: "h-quoted-comma",
      input: { csv: '"A, B",c\n"d, e",f' },
      expect: { kind: "exact", value: '"A, B",c\n"d, e",f' },
      weight: 1,
    },
    { id: "h-nfc", input: { csv: "city\nzürich" }, expect: { kind: "exact", value: "city\nzürich" }, weight: 1 },
    { id: "h-blank-tail", input: { csv: "k,v\n1,2\n\n\n" }, expect: { kind: "exact", value: "k,v\n1,2" }, weight: 1 },
  ],
  "json-extract": [
    {
      id: "h-city",
      input: { text: "Deliver to Pune before noon.", fields: ["city"] },
      expect: { kind: "exact", value: { city: "Pune" } },
      weight: 1,
    },
    {
      id: "h-phone",
      input: { text: "Call 022-5550-1234 after 5pm.", fields: ["phone"] },
      expect: { kind: "exact", value: { phone: "022-5550-1234" } },
      weight: 1,
    },
  ],
  "flaky-fx": [
    {
      id: "h-gbp-eur",
      input: { from: "GBP", to: "USD", amount: 9 },
      expect: { kind: "schema", schema: { type: "object", required: ["rate"] } },
      weight: 1,
    },
    {
      id: "h-inr",
      input: { from: "INR", to: "USD", amount: 250 },
      expect: { kind: "schema", schema: { type: "object", required: ["rate"] } },
      weight: 1,
    },
  ],
};

import { seedDemoState } from "./demo/seed";

async function main(): Promise<void> {
  const seed = await seedDemoState();
  console.log(`Seeded ${seed.services.length} services and ${seed.critics.length} critic fixtures locally.`);
}

void main();

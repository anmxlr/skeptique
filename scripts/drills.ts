import { createLocalTestHarness } from './demo/local-test-harness';
import { rehearseDemo } from './demo/drills';

async function main(): Promise<void> {
  const result = await rehearseDemo(createLocalTestHarness());
  console.log(`LOCAL FIXTURE RUN ONLY: ${result.drills.length} failure drills passed in ${result.elapsedSeconds.toFixed(2)}s; full demo rehearsal remains pending.`);
}

void main();

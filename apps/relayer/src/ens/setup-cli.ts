import { ensFromEnv } from "../env";

const ens = ensFromEnv(console.log);
const { registries } = await ens.setupNamespace();
console.log(`namespace ready for ${ens.parent}`, registries);

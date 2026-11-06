import type { Metadata } from "next";

import { Critics } from "../../components/critics";

export const metadata: Metadata = { title: "Critics" };

export default function CriticsPage() {
  return (
    <>
      <h1>Critics</h1>
      <p>Verified humans register critic agents, stake, and review services.</p>
      <Critics />
    </>
  );
}

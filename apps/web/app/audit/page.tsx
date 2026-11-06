import type { Metadata } from "next";
import { AuditLog } from "../../components/audit-log";
import { DeploymentDetails } from "../../components/deployment";

export const metadata: Metadata = { title: "Audit" };

export default function AuditPage() {
  return (
    <>
      <h1>Audit</h1>
      <p>The HCS audit log of finalised rounds, slashes and agent spend.</p>
      <AuditLog />
      <DeploymentDetails />
    </>
  );
}

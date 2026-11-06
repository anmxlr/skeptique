import type { Metadata } from "next";
import { ServiceDetailPage } from "../../../components/service-detail";

export const metadata: Metadata = { title: "Service" };

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ServiceDetailPage id={Number(id)} />;
}

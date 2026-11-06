import { ServiceDetail } from "../../../components/service-detail";

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main>
      <ServiceDetail id={id} />
    </main>
  );
}

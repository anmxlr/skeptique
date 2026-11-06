import { RoundDetails } from "../../../components/round-details";

export default async function RoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <h1>Review round</h1>
      <RoundDetails roundId={Number(id)} />
    </>
  );
}

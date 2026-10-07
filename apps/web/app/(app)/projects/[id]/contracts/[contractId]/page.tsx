import { ContractDetail } from "../../../../../../components/commercial/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const { id, contractId } = await params;
  return <ContractDetail id={id} contractId={contractId} />;
}

import { ContractFinancial } from "../../../../../../../components/financial/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; contractId: string }>;
}) {
  const p = await params;
  return <ContractFinancial {...p} />;
}

import { FundingPage } from "../../../../../components/financial/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <FundingPage {...p} />;
}

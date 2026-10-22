import { NcrDetail } from "../../../../../../components/quality/ncr";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; ncrId: string }>;
}) {
  const p = await params;
  return <NcrDetail id={p.id} ncrId={p.ncrId} />;
}

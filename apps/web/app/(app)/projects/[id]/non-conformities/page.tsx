import { NonConformities } from "../../../../../components/quality/ncr";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <NonConformities id={p.id} />;
}

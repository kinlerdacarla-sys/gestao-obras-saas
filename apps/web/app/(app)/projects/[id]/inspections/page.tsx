import { Inspections } from "../../../../../components/quality/inspections";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <Inspections id={p.id} />;
}

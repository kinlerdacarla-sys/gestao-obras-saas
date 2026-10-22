import { Requests } from "../../../../../components/quality/inspections";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <Requests id={p.id} />;
}

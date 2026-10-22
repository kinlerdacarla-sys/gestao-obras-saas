import { QualityDashboard } from "../../../../../components/quality/dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <QualityDashboard id={p.id} />;
}

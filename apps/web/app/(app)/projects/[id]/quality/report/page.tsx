import { QualityReport } from "../../../../../../components/quality/dashboard";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <QualityReport id={p.id} />;
}

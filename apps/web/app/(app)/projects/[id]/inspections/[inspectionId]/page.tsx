import { InspectionDetail } from "../../../../../../components/quality/inspections";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
}) {
  const p = await params;
  return <InspectionDetail id={p.id} inspectionId={p.inspectionId} />;
}

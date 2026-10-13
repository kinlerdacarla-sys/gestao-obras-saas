import { MeasurementDetail } from "../../../../../../components/financial/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; measurementId: string }>;
}) {
  const p = await params;
  return <MeasurementDetail {...p} />;
}

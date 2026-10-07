import { DailyLogPage } from "../../../../../../components/execution/daily-log-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; logId: string }>;
}) {
  const { id, logId } = await params;
  return <DailyLogPage id={id} logId={logId} />;
}

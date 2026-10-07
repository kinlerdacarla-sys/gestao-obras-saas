import { DailyLogList } from "../../../../../components/execution/daily-log-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DailyLogList id={id} />;
}

import { SchedulePage } from "../../../../../components/execution/schedule-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SchedulePage id={id} />;
}

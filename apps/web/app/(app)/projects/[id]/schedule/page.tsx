import { SchedulePage } from "../../../../../components/execution/schedule-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ delayed?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  return <SchedulePage id={id} initialDelayed={q.delayed === "true"} />;
}

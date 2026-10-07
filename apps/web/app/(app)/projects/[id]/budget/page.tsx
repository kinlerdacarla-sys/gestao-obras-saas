import { BudgetPage } from "../../../../../components/budget/budget-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revisionId?: string }>;
}) {
  const { id } = await params;
  const { revisionId } = await searchParams;
  return <BudgetPage id={id} revisionId={revisionId} />;
}

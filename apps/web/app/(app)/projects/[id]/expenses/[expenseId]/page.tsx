import { ExpensesPage } from "../../../../../../components/commercial/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; expenseId: string }>;
}) {
  const { id, expenseId } = await params;
  return <ExpensesPage id={id} expenseId={expenseId} />;
}

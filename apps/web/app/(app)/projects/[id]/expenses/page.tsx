import { ExpensesPage } from "../../../../../components/commercial/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExpensesPage id={id} />;
}

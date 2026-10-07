import { ImportPage } from "../../../../../../components/budget/import-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ revisionId?: string }>;
}) {
  const { id } = await params;
  void searchParams;
  return <ImportPage id={id} />;
}

import { CentersPage } from "../../../../../components/commercial/pages";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CentersPage id={id} />;
}

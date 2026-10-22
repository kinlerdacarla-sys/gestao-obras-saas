import { NonConformities } from "../../../../../components/quality/ncr";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["severity", "status", "overdue", "active"])
    if (typeof search[key] === "string") query.set(key, search[key]);
  return <NonConformities id={id} initialQuery={query.toString()} />;
}

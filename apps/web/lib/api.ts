let refreshing: Promise<Response> | undefined;
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const request = () =>
    fetch(`/api/v1${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      credentials: "include",
      cache: "no-store",
    });
  let response = await request();
  if (
    response.status === 401 &&
    (!path.startsWith("/auth/") || path === "/auth/me")
  ) {
    refreshing ??= fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      refreshing = undefined;
    });
    if ((await refreshing).ok) response = await request();
    else {
      window.location.assign("/login");
      throw new Error("Sessão expirada");
    }
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message ?? "Não foi possível concluir a operação");
  return data as T;
}
export const send = (method: string, data?: unknown): RequestInit => ({
  method,
  body: data === undefined ? undefined : JSON.stringify(data),
});
export interface Me {
  role: string;
  user: { id: string; name: string; email: string };
  tenant: { name: string; slug: string };
}
export interface Project {
  id: string;
  code: string;
  name: string;
  location: string | null;
  description: string | null;
  status: string;
  startDate: string | null;
  plannedEndDate: string | null;
  contractValue: string | null;
  currency: string;
}
export interface Member {
  role: string;
  status: string;
  user: { id: string; name: string; email: string };
}
export interface Organization {
  id: string;
  legalName: string;
  organizationType: string;
  email: string | null;
  phone: string | null;
  tradeName: string | null;
  taxNumber: string | null;
  address: string | null;
}
export const labels: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  INSPECTOR: "Fiscal",
  FINANCIER: "Financiador",
  CLIENT: "Cliente",
  PLANNING: "Planeamento",
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
  INVITED: "Convidado",
  DISABLED: "Desativado",
};

import type { Role } from "../../domain/src/index.js";
export interface AuthContext {
  userId: string;
  tenantId: string;
  sessionId: string;
  role: Role;
}
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details: unknown[];
}

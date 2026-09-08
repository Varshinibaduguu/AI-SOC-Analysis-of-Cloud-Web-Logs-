import { api } from "@/lib/api";
import { UserRole } from "@/store/auth-store";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: UserRole;
  user_id: number;
  full_name: string;
}

export interface UserProfile {
  id: number;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export const authService = {
  login: (email: string, password: string) =>
    api.post<LoginResponse>("/auth/login", { email, password }),

  register: (data: { email: string; password: string; full_name: string }) =>
    api.post("/auth/register", data),

  me: (token: string) => api.get<UserProfile>("/auth/me", token),
};

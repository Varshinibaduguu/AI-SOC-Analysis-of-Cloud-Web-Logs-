import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserRole = "admin" | "security_analyst" | "viewer";

interface AuthState {
  token: string | null;
  userId: number | null;
  fullName: string | null;
  role: UserRole | null;
  setAuth: (data: {
    token: string;
    userId: number;
    fullName: string;
    role: UserRole;
  }) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      userId: null,
      fullName: null,
      role: null,
      setAuth: (data) =>
        set({
          token: data.token,
          userId: data.userId,
          fullName: data.fullName,
          role: data.role,
        }),
      logout: () =>
        set({ token: null, userId: null, fullName: null, role: null }),
      isAuthenticated: () => !!get().token,
    }),
    { name: "soc-auth" }
  )
);

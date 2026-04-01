import React, { createContext, useContext, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

export type AuthUser =
  | { type: "vendor"; id: number; name: string; status: string; email: string }
  | { type: "user"; id: number; name: string; role: string; email: string }
  | null;

interface AuthContextType {
  user: AuthUser;
  loading: boolean;
  refetch: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  refetch: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = async () => {
    setLoading(true);
    try {
      const res = await apiGet("/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMe(); }, []);

  const logout = async () => {
    await apiPost("/auth/logout", {});
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, refetch: fetchMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

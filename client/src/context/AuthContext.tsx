import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

interface User {
  id: string;
  email: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const refreshUser = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
    }
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  useEffect(() => {
    if (localStorage.getItem("token")) refreshUser();
  }, []);

  return (
    <AuthContext.Provider value={{ user, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
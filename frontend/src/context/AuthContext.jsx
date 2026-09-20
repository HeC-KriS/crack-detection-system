// context/AuthContext.jsx
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authAPI } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    const savedUser = localStorage.getItem("user");
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.clear();
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await authAPI.login(username, password);

    localStorage.setItem("access_token", data.access_token);

    const payload = JSON.parse(
      atob(data.access_token.split(".")[1])
    );

    const userObj = {
      username,
      role: payload.role,
      expiresIn: data.expires_in,
    };

    localStorage.setItem("user", JSON.stringify(userObj));
    setUser(userObj);

    return userObj;
  }, []);

  const signup = useCallback(async (username, email, password) => {
    const { data } = await authAPI.signup(username, email, password);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
};

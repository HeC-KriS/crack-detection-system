// api/client.js — Axios instance with automatic JWT injection and refresh handling
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

const client = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// Inject token on every request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 — clear token and redirect to login
client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default client;

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (username, password) =>
    client.post("/auth/login", { username, password }),
};

// ── Cameras ───────────────────────────────────────────────────────────────────
export const camerasAPI = {
  list: () => client.get("/cameras"),
  get: (id) => client.get(`/cameras/${id}`),
  create: (data) => client.post("/cameras", data),
  update: (id, data) => client.patch(`/cameras/${id}`, data),
  delete: (id) => client.delete(`/cameras/${id}`),
  restart: (id) => client.post(`/cameras/${id}/restart`),
};

// ── Inferences ────────────────────────────────────────────────────────────────
export const inferencesAPI = {
  list: (params) => client.get("/inferences", { params }),
  get: (id) => client.get(`/inferences/${id}`),
  imageUrl: (id) => `${API_BASE}/inferences/${id}/image`,
};

// ── Feedback ──────────────────────────────────────────────────────────────────
export const feedbackAPI = {
  submit: (inferenceId, data) => client.post(`/feedback/${inferenceId}`, data),
  update: (inferenceId, data) => client.put(`/feedback/${inferenceId}`, data),
  get: (inferenceId) => client.get(`/feedback/${inferenceId}`),
};

// ── Stats ─────────────────────────────────────────────────────────────────────
export const statsAPI = {
  dashboard: () => client.get("/stats"),
  exportRetraining: (params) =>
    client.get("/stats/export/retraining-dataset", {
      params,
      responseType: "blob",
    }),
};

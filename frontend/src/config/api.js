// Same-origin in production (nginx proxies /api/* -> uvicorn).
// For local dev against `uvicorn ... --port 8011`, override at build time
// with VITE_API_BASE_URL=http://127.0.0.1:8011 npm run dev.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

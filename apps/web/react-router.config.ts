import type { Config } from "@react-router/dev/config";

// React Router 8 uses Vite's environment API by default, which the Cloudflare Vite plugin needs.
export default {
  ssr: true,
} satisfies Config;

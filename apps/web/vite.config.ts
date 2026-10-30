import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import stsx from "@lumiose/stsx";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Rolldown } from "vite";

const root = import.meta.dirname;
const shadows = path.join(root, ".lumiose/stsx");

/**
 * Vite's dependency scanner doesn't run the STSX plugin, so it can't read `.stsx` imports and
 * skips pre-bundling (then reloads the page on first visit). STSX writes a plain TSX shadow of
 * every `.stsx` file to `.lumiose/stsx`; point the scanner at those instead.
 */
const scanStsxShadows: Rolldown.Plugin = {
  name: "scan-stsx-shadows",
  resolveId(source, importer) {
    if (!importer || !/\.stsx(\.tsx)?$/.test(source)) return null;
    const realImporter = importer.startsWith(shadows)
      ? path.join(root, path.relative(shadows, importer)).replace(/\.tsx$/, "")
      : importer;
    const target = path.resolve(path.dirname(realImporter), source.replace(/\.tsx$/, ""));
    return path.join(shadows, `${path.relative(root, target)}.tsx`);
  },
};

export default defineConfig({
  plugins: [
    // STSX must run before the framework plugin: it turns .stsx files into TSX plus a stylesheet.
    // The class strategy lets a parent's scoped class reach a child component through `className`.
    stsx({ classAttribute: "className", scopedStyles: { strategy: "class" } }),
    // Runs the SSR environment in workerd (the real Workers runtime), with the bindings from wrangler.jsonc.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    reactRouter(),
  ],
  optimizeDeps: { rolldownOptions: { plugins: [scanStsxShadows] } },
  build: {
    // One stylesheet for the whole app. React Router reads this top-level setting to link it.
    cssCodeSplit: false,
  },
  environments: {
    // Split, the server build's CSS is cleaned by React Router; as one file, React Router would
    // move it into the client assets, where nothing links it.
    ssr: {
      build: { cssCodeSplit: true },
      optimizeDeps: { rolldownOptions: { plugins: [scanStsxShadows] } },
    },
  },
  server: { port: 5173, strictPort: true },
});

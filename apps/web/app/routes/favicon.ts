import { redirect } from "react-router";

// Browsers ask for /favicon.ico regardless of the <link rel="icon"> in root.tsx.
export function loader() {
  return redirect("/favicon.svg", 301);
}

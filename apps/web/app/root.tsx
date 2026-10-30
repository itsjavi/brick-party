import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from "react-router";
import "./tokens.css";
import type { Route } from "./+types/root";
import { ErrorScreen } from "./components/ErrorScreen.stsx";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=swap",
  },
];

const DESCRIPTION = "The Formbricks party game: surveys, bots, and terrible feedback.";

export const meta: Route.MetaFunction = () => [
  { title: "Brick Party" },
  { name: "description", content: DESCRIPTION },
  { name: "theme-color", content: "#3aaefc" },
];

/** The site's address, so the share card's image URL is absolute, as chat apps and social sites need it. */
export function loader({ request }: Route.LoaderArgs) {
  return { origin: new URL(request.url).origin };
}

/**
 * What chat apps and social sites show for a shared link: the same card for every page, room invites included. It
 * lives in the layout rather than in `meta`, because a page's own `meta` replaces the root's.
 */
function ShareTags() {
  const origin = useRouteLoaderData<typeof loader>("root")?.origin;
  if (!origin) return null;
  return (
    <>
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Brick Party" />
      <meta property="og:title" content="Brick Party" />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:image" content={`${origin}/og-image.png`} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Brick Party: a crowd of toy bricks in party hats under the game's logo" />
      <meta name="twitter:card" content="summary_large_image" />
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <ShareTags />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error)) {
    return (
      <ErrorScreen
        title={error.status === 404 ? "Brick not found" : `Error ${error.status}`}
        message={error.status === 404 ? "That page fell behind the sofa." : String(error.data || error.statusText)}
      />
    );
  }
  const detail = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;
  return <ErrorScreen title="Something broke" message="The bricks fell over. Try again in a moment." detail={detail} />;
}

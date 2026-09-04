import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "~/components/ui/alert";
import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
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
  let message = "Something went wrong";
  let details = "The Batam planner could not be loaded.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
      <Alert className="w-full" variant="destructive">
        <AlertTitle>{message}</AlertTitle>
        <AlertDescription>
          <p>{details}</p>
        </AlertDescription>
        {stack && (
          <pre className="mt-3 w-full overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <code>{stack}</code>
          </pre>
        )}
      </Alert>
    </main>
  );
}

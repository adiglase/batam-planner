import { useRef, useState } from "react";
import { data, Link, redirect } from "react-router";
import { ArrowLeftIcon, LoaderCircleIcon } from "lucide-react";

import type { Route } from "./+types/owner-login";
import { AuthNotConfigured, getOwnerAuth } from "~/auth/better-auth.server";
import { authClient } from "~/auth/auth-client";
import { LOGIN_DENIED, LOGIN_FAILED, LOGIN_NOT_CONFIGURED, loginErrorMessage } from "~/auth/login-messages";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";

export function meta() {
  return [{ title: "Owner sign in | Batam Planner" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const runtime = getOwnerAuth();
    const session = await runtime.auth.api.getSession({ headers: request.headers });
    if (session && runtime.policy.isOwner(session.user.id)) {
      return redirect("/owner/destinations", { headers });
    }
    const error = new URL(request.url).searchParams.get("error");
    return data({ configured: true, message: session ? LOGIN_DENIED : loginErrorMessage(error) }, { headers });
  } catch (error) {
    if (!(error instanceof AuthNotConfigured)) throw error;
    console.error(`[owner-auth] ${error.message}`);
    return data({ configured: false, message: LOGIN_NOT_CONFIGURED }, { status: 503, headers });
  }
}

export default function OwnerLogin({ loaderData }: Route.ComponentProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const starting = useRef(false);

  async function signIn() {
    if (starting.current) return;
    starting.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/owner/destinations",
        newUserCallbackURL: "/owner/destinations",
        errorCallbackURL: "/owner/login",
      });
      if (!result.error) return;
      setError(result.error.code === "auth_not_configured" ? LOGIN_NOT_CONFIGURED : LOGIN_FAILED);
    } catch { setError(LOGIN_FAILED); }
    starting.current = false;
    setPending(false);
  }

  const message = error ?? loaderData.message;
  return (
    <main className="owner-shell flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle><h1>Owner sign in</h1></CardTitle>
          <CardDescription>Sign in with your authorized Google account to manage Destinations.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {message && (
            <Alert role="alert">
              <AlertTitle>Sign-in unavailable</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <Button size="lg" className="w-full" disabled={pending || !loaderData.configured} onClick={signIn}>
            {pending && <LoaderCircleIcon className="animate-spin motion-reduce:animate-none" data-icon="inline-start" aria-hidden="true" />}
            {pending ? "Connecting to Google…" : "Continue with Google"}
          </Button>
          {!loaderData.configured && <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button>}
        </CardContent>
        <CardFooter>
          <Link className={buttonVariants({ variant: "ghost" })} to="/">
            <ArrowLeftIcon data-icon="inline-start" />Back to planner
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}

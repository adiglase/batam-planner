import { FilePenLineIcon, LogOutIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/owner-destinations";
import { requireOwner } from "~/auth/owner-auth.server";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { getDestinationRepository } from "~/destinations/sqlite-destination-repository.server";

export function meta() {
  return [{ title: "Destination publishing | Batam Planner" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireOwner(request);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const destinations = getDestinationRepository()
    .listForOwner()
    .filter((item) => {
      const name = item.draft?.candidate.name || item.published?.name || "";
      return name.toLocaleLowerCase().includes(query.toLocaleLowerCase());
    });
  return { destinations, query };
}

export async function action({ request }: Route.ActionArgs) {
  await requireOwner(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const repository = getDestinationRepository();

  if (intent === "create") {
    const draft = repository.createDraft();
    return redirect(`/owner/destinations/${draft.id}`);
  }
  if (intent === "edit-published") {
    const destinationId = String(formData.get("destinationId") ?? "");
    const draft = repository.startReplacementDraft(destinationId);
    return redirect(`/owner/destinations/${draft.id}`);
  }
  throw new Response("Unknown owner action", { status: 400 });
}

export default function OwnerDestinations({ loaderData }: Route.ComponentProps) {
  const { destinations, query } = loaderData;
  return (
    <main className="owner-shell">
      <header className="owner-topbar">
        <Link className="brand" to="/" aria-label="Batam Planner home">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>Batam Planner</span>
        </Link>
        <Badge variant="secondary">Private owner workspace</Badge>
        <Form method="post" action="/owner/logout">
          <Button variant="ghost" size="sm">
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </Form>
      </header>

      <div className="owner-page">
        <header className="owner-heading">
          <div>
            <p className="owner-eyebrow">Destination publishing</p>
            <h1>Curate Batam with confidence.</h1>
            <p>Draft privately, preview the Visitor presentation, then Publish only when the content contract is complete.</p>
          </div>
          <Form method="post">
            <Button name="intent" value="create">
              <PlusIcon data-icon="inline-start" />
              Create Draft
            </Button>
          </Form>
        </header>

        <Form method="get" className="owner-search" role="search">
          <Input name="q" defaultValue={query} placeholder="Filter Destinations by name" aria-label="Filter Destinations by name" />
          <Button type="submit" variant="outline">
            <SearchIcon data-icon="inline-start" />
            Filter
          </Button>
        </Form>

        {destinations.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No Destinations found</EmptyTitle>
              <EmptyDescription>Create a private Draft or change the current filter.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <section className="owner-grid" aria-label="Destination publishing list">
            {destinations.map((item) => {
              const name = item.draft?.candidate.name || item.published?.name || "Untitled Destination";
              return (
                <Card key={item.destinationId}>
                  <CardHeader>
                    <CardTitle>{name}</CardTitle>
                    <CardDescription>
                      {item.draft?.replacesPublished
                        ? "Published · replacement Draft in progress"
                        : item.draft
                          ? "Private Draft"
                          : "Published"}
                    </CardDescription>
                    <CardAction>
                      <Badge variant={item.draft ? "secondary" : "outline"}>
                        {item.draft ? "Draft" : "Published"}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <p className="destination-description">
                      {item.draft?.candidate.description || item.published?.description || "No description yet."}
                    </p>
                  </CardContent>
                  <CardFooter>
                    {item.draft ? (
                      <Link className={buttonVariants({ variant: "outline", className: "w-full" })} to={`/owner/destinations/${item.draft.id}`}>
                        <FilePenLineIcon data-icon="inline-start" />
                        Edit Draft
                      </Link>
                    ) : (
                      <Form method="post" className="w-full">
                        <input type="hidden" name="destinationId" value={item.destinationId} />
                        <Button className="w-full" variant="outline" name="intent" value="edit-published">
                          <FilePenLineIcon data-icon="inline-start" />
                          Edit Published Destination
                        </Button>
                      </Form>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

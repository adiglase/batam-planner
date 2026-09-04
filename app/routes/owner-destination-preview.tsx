import { ArrowLeftIcon, FilePenLineIcon } from "lucide-react";
import { Link } from "react-router";

import type { Route } from "./+types/owner-destination-preview";
import { requireOwner } from "~/auth/owner-auth.server";
import { Badge } from "~/components/ui/badge";
import { buttonVariants } from "~/components/ui/button";
import { DestinationPresentationCard } from "~/destinations/destination-presentation-card";
import { getDestinationRepository } from "~/destinations/sqlite-destination-repository.server";

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `Preview ${loaderData?.preview.name || "Destination"} | Batam Planner` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireOwner(request);
  const repository = getDestinationRepository();
  const draft = repository.getDraft(params.draftId);
  if (!draft) throw new Response("Destination Draft not found", { status: 404 });
  return { draft, preview: repository.previewDraft(params.draftId) };
}

export default function OwnerDestinationPreview({ loaderData }: Route.ComponentProps) {
  const { draft, preview } = loaderData;
  return (
    <main className="owner-shell">
      <header className="owner-topbar">
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} to="/owner/destinations">
          <ArrowLeftIcon data-icon="inline-start" />All Destinations
        </Link>
        <Badge variant="secondary">Private preview</Badge>
      </header>
      <div className="owner-page owner-preview-page">
        <header className="owner-heading">
          <div>
            <p className="owner-eyebrow">Visitor presentation preview</p>
            <h1>{preview.name || "Untitled Destination"}</h1>
            <p>This uses the same facts, media fallback, warnings, and omission rules as Visitor discovery.</p>
          </div>
          <Link className={buttonVariants({ variant: "outline" })} to={`/owner/destinations/${draft.id}`}>
            <FilePenLineIcon data-icon="inline-start" />Continue editing
          </Link>
        </header>
        <div className="owner-preview-card">
          <DestinationPresentationCard destination={preview} />
        </div>
      </div>
    </main>
  );
}

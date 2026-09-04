import { ArrowLeftIcon, EyeIcon, SaveIcon, SendIcon } from "lucide-react";
import { Form, Link, redirect } from "react-router";

import type { Route } from "./+types/owner-destination-edit";
import { requireOwner } from "~/auth/owner-auth.server";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button, buttonVariants } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { DESTINATION_CATEGORIES, type DestinationCandidate, type DestinationCategory, type OperationalStatus } from "~/destinations/destination";
import type { PublishErrors } from "~/destinations/destination-repository.server";
import { getDestinationRepository } from "~/destinations/sqlite-destination-repository.server";

function trimmedFormValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function numberOrNull(formData: FormData, name: string) {
  const value = trimmedFormValue(formData, name);
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function candidateFromForm(formData: FormData): DestinationCandidate {
  return {
    name: trimmedFormValue(formData, "name"),
    primaryCategory: trimmedFormValue(formData, "primaryCategory") as DestinationCategory | "",
    area: trimmedFormValue(formData, "area"),
    description: trimmedFormValue(formData, "description"),
    latitude: numberOrNull(formData, "latitude"),
    longitude: numberOrNull(formData, "longitude"),
    operationalStatus: trimmedFormValue(formData, "operationalStatus") as OperationalStatus | "",
    typicalVisitMinutes: numberOrNull(formData, "typicalVisitMinutes"),
    operatingHoursLabel: trimmedFormValue(formData, "operatingHoursLabel"),
    entryCostLabel: trimmedFormValue(formData, "entryCostLabel"),
    googleMapsUrl: trimmedFormValue(formData, "googleMapsUrl"),
    imageUrl: trimmedFormValue(formData, "imageUrl"),
    imageAltText: trimmedFormValue(formData, "imageAltText"),
    imageRightsSource: trimmedFormValue(formData, "imageRightsSource"),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.draft.candidate.name || "Draft Destination"} | Batam Planner` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireOwner(request);
  const draft = getDestinationRepository().getDraft(params.draftId);
  if (!draft) throw new Response("Draft Destination not found", { status: 404 });
  return { draft };
}

export async function action({ request, params }: Route.ActionArgs) {
  await requireOwner(request);
  const formData = await request.formData();
  const repository = getDestinationRepository();
  repository.saveDraft(params.draftId, candidateFromForm(formData));
  const intent = formData.get("intent");

  if (intent === "preview") {
    return redirect(`/owner/destinations/${params.draftId}/preview`);
  }
  if (intent === "publish") {
    const result = repository.publishDraft(params.draftId);
    if (!result.ok) return { errors: result.errors, saved: true };
    return redirect("/owner/destinations?published=1");
  }
  return { errors: {} as PublishErrors, saved: true };
}

export default function OwnerDestinationEdit({ loaderData, actionData }: Route.ComponentProps) {
  const { draft } = loaderData;
  const candidate = draft.candidate;
  const errors = actionData?.errors ?? {};
  const error = (name: keyof DestinationCandidate) => errors[name];

  return (
    <main className="owner-shell">
      <header className="owner-topbar">
        <Link className={buttonVariants({ variant: "ghost", size: "sm" })} to="/owner/destinations">
          <ArrowLeftIcon data-icon="inline-start" />
          All Destinations
        </Link>
        <Badge variant="secondary">Private Draft Destination</Badge>
      </header>
      <div className="owner-page owner-editor-page">
        <header className="owner-heading">
          <div>
            <p className="owner-eyebrow">{draft.replacesPublished ? "Replacement Draft Destination" : "New Destination"}</p>
            <h1>{candidate.name || "Untitled Destination"}</h1>
            <p>{draft.replacesPublished ? "The current Published Destination stays live until this replacement passes validation and is Published." : "This Destination remains private until it passes validation and becomes a Published Destination."}</p>
          </div>
        </header>

        {Object.keys(errors).length > 0 && (
          <Alert variant="destructive">
            <AlertTitle>This Draft Destination cannot Publish yet</AlertTitle>
            <AlertDescription>Correct the fields identified below, then Publish again.</AlertDescription>
          </Alert>
        )}
        {actionData?.saved && Object.keys(errors).length === 0 && (
          <Alert>
            <AlertTitle>Draft Destination saved</AlertTitle>
            <AlertDescription>Your changes remain private.</AlertDescription>
          </Alert>
        )}

        <Form method="post" className="owner-editor-form">
          <Card>
            <CardHeader>
              <CardTitle>Visitor content</CardTitle>
              <CardDescription>English facts shown in discovery and preview.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(error("name"))}>
                  <FieldLabel htmlFor="name">Name</FieldLabel>
                  <Input id="name" name="name" defaultValue={candidate.name} aria-invalid={Boolean(error("name"))} />
                  <FieldError>{error("name")}</FieldError>
                </Field>
                <Field data-invalid={Boolean(error("primaryCategory"))}>
                  <FieldLabel htmlFor="primary-category">Primary category</FieldLabel>
                  <Select name="primaryCategory" defaultValue={candidate.primaryCategory || null}>
                    <SelectTrigger id="primary-category" className="w-full" aria-invalid={Boolean(error("primaryCategory"))}>
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {DESTINATION_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError>{error("primaryCategory")}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor="area">Area or district</FieldLabel>
                  <Input id="area" name="area" defaultValue={candidate.area} />
                  <FieldDescription>Optional; omitted from the Visitor presentation when empty.</FieldDescription>
                </Field>
                <Field data-invalid={Boolean(error("description"))}>
                  <FieldLabel htmlFor="description">Concise description</FieldLabel>
                  <Textarea id="description" name="description" defaultValue={candidate.description} aria-invalid={Boolean(error("description"))} />
                  <FieldError>{error("description")}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Planning facts</CardTitle><CardDescription>Required facts keep discovery trustworthy and comparable.</CardDescription></CardHeader>
            <CardContent>
              <FieldGroup>
                <FieldSet>
                  <FieldLegend variant="label">Coordinates</FieldLegend>
                  <FieldGroup className="owner-coordinate-fields">
                    <Field data-invalid={Boolean(error("latitude"))}>
                      <FieldLabel htmlFor="latitude">Latitude</FieldLabel>
                      <Input id="latitude" name="latitude" type="number" step="any" defaultValue={candidate.latitude ?? ""} aria-invalid={Boolean(error("latitude"))} />
                      <FieldError>{error("latitude")}</FieldError>
                    </Field>
                    <Field data-invalid={Boolean(error("longitude"))}>
                      <FieldLabel htmlFor="longitude">Longitude</FieldLabel>
                      <Input id="longitude" name="longitude" type="number" step="any" defaultValue={candidate.longitude ?? ""} aria-invalid={Boolean(error("longitude"))} />
                      <FieldError>{error("longitude")}</FieldError>
                    </Field>
                  </FieldGroup>
                </FieldSet>
                <Field data-invalid={Boolean(error("operationalStatus"))}>
                  <FieldLabel htmlFor="operational-status">Operational status</FieldLabel>
                  <Select name="operationalStatus" defaultValue={candidate.operationalStatus || null}>
                    <SelectTrigger id="operational-status" className="w-full" aria-invalid={Boolean(error("operationalStatus"))}><SelectValue placeholder="Choose a status" /></SelectTrigger>
                    <SelectContent><SelectGroup><SelectItem value="Open">Open</SelectItem><SelectItem value="Temporarily closed">Temporarily closed</SelectItem></SelectGroup></SelectContent>
                  </Select>
                  <FieldError>{error("operationalStatus")}</FieldError>
                </Field>
                <Field data-invalid={Boolean(error("typicalVisitMinutes"))}>
                  <FieldLabel htmlFor="typical-visit-minutes">Typical visit duration (minutes)</FieldLabel>
                  <Input id="typical-visit-minutes" name="typicalVisitMinutes" type="number" min="1" step="1" defaultValue={candidate.typicalVisitMinutes ?? ""} aria-invalid={Boolean(error("typicalVisitMinutes"))} />
                  <FieldDescription>Not required for Accommodation.</FieldDescription>
                  <FieldError>{error("typicalVisitMinutes")}</FieldError>
                </Field>
                <Field data-invalid={Boolean(error("operatingHoursLabel"))}>
                  <FieldLabel htmlFor="operating-hours">Operating hours</FieldLabel>
                  <Input id="operating-hours" name="operatingHoursLabel" defaultValue={candidate.operatingHoursLabel} aria-invalid={Boolean(error("operatingHoursLabel"))} placeholder="Hours unknown" />
                  <FieldDescription>Use an explicit unknown-hours label when needed. Not required for Accommodation.</FieldDescription>
                  <FieldError>{error("operatingHoursLabel")}</FieldError>
                </Field>
                <Field data-invalid={Boolean(error("entryCostLabel"))}>
                  <FieldLabel htmlFor="entry-cost">Entry cost</FieldLabel>
                  <Input id="entry-cost" name="entryCostLabel" defaultValue={candidate.entryCostLabel} aria-invalid={Boolean(error("entryCostLabel"))} placeholder="Cost unknown" />
                  <FieldDescription>Use Free, a fixed IDR amount, an IDR range, or Cost unknown. Not required for Accommodation.</FieldDescription>
                  <FieldError>{error("entryCostLabel")}</FieldError>
                </Field>
                <Field data-invalid={Boolean(error("googleMapsUrl"))}>
                  <FieldLabel htmlFor="google-maps-url">Google Maps link</FieldLabel>
                  <Input id="google-maps-url" name="googleMapsUrl" type="url" defaultValue={candidate.googleMapsUrl} aria-invalid={Boolean(error("googleMapsUrl"))} />
                  <FieldError>{error("googleMapsUrl")}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Optional image</CardTitle><CardDescription>Rights/source stays private; the image and English alt text are Visitor-facing.</CardDescription></CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(error("imageUrl"))}>
                  <FieldLabel htmlFor="image-url">Image URL</FieldLabel>
                  <Input id="image-url" name="imageUrl" type="url" defaultValue={candidate.imageUrl} aria-invalid={Boolean(error("imageUrl"))} />
                  <FieldError>{error("imageUrl")}</FieldError>
                </Field>
                <Field data-invalid={Boolean(error("imageAltText"))}>
                  <FieldLabel htmlFor="image-alt-text">English alt text</FieldLabel>
                  <Input id="image-alt-text" name="imageAltText" defaultValue={candidate.imageAltText} aria-invalid={Boolean(error("imageAltText"))} />
                  <FieldError>{error("imageAltText")}</FieldError>
                </Field>
                <Field data-invalid={Boolean(error("imageRightsSource"))}>
                  <FieldLabel htmlFor="image-rights-source">Private rights and source</FieldLabel>
                  <Textarea id="image-rights-source" name="imageRightsSource" defaultValue={candidate.imageRightsSource} aria-invalid={Boolean(error("imageRightsSource"))} />
                  <FieldDescription>This note is never exposed in the public Destination contract.</FieldDescription>
                  <FieldError>{error("imageRightsSource")}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <div className="owner-editor-actions">
            <Button type="submit" variant="outline" name="intent" value="save"><SaveIcon data-icon="inline-start" />Save Draft Destination</Button>
            <Button type="submit" variant="outline" name="intent" value="preview"><EyeIcon data-icon="inline-start" />Save and preview</Button>
            <Button type="submit" name="intent" value="publish"><SendIcon data-icon="inline-start" />Publish</Button>
          </div>
        </Form>
      </div>
    </main>
  );
}

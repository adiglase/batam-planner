import type {
  EntryCostFacts,
  OperatingHoursFacts,
} from "~/destinations/destination";

const IDR_AMOUNT = "(?:0|[1-9]\\d{0,2}(?:,\\d{3})+|[1-9]\\d*)";

const ENTRY_COST_PATTERN = new RegExp(
  `^IDR (${IDR_AMOUNT})(?:\\s*[–-]\\s*(?:IDR )?(${IDR_AMOUNT}))?`,
);

function parseIdrAmount(value: string) {
  return Number(value.replace(/,/g, ""));
}

/**
 * Classifies a curated Entry-cost label into its modeled kind so summaries
 * and details can keep Free, fixed IDR, IDR range, and Cost unknown visibly
 * distinct. Any trailing qualification (for example "per person") is kept
 * separate from the amount.
 */
export function describeEntryCost(label: string): EntryCostFacts {
  const trimmed = label.trim();

  if (trimmed.startsWith("Free")) {
    const qualification = trimmed.slice("Free".length).trim();
    return qualification ? { kind: "free", qualification } : { kind: "free" };
  }
  if (trimmed.startsWith("Cost unknown")) {
    const qualification = trimmed.slice("Cost unknown".length).trim();
    return qualification
      ? { kind: "unknown", qualification }
      : { kind: "unknown" };
  }

  const match = ENTRY_COST_PATTERN.exec(trimmed);
  const amount = match?.[1];
  if (!amount) return { kind: "unknown", qualification: trimmed };

  const rangeEnd = match[2];
  const qualification = trimmed.slice(match[0].length).trim();
  const base = rangeEnd
    ? ({
        kind: "range",
        minIdr: parseIdrAmount(amount),
        maxIdr: parseIdrAmount(rangeEnd),
      } as const)
    : ({ kind: "fixed", amountIdr: parseIdrAmount(amount) } as const);

  return qualification ? { ...base, qualification } : base;
}

/**
 * Classifies a curated Operating-hours label. Unknown hours stay explicitly
 * represented rather than being omitted or guessed.
 */
export function describeOperatingHours(label: string): OperatingHoursFacts {
  const trimmed = label.trim();
  if (trimmed === "Hours unknown") return { kind: "unknown" };
  if (trimmed === "No meaningful restriction") return { kind: "unrestricted" };
  return { kind: "periods", text: trimmed };
}

export function formatIdr(amountIdr: number) {
  return `IDR ${amountIdr.toLocaleString("en-US")}`;
}

export function formatVisitDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} hr` : `${hours} hr ${remainder} min`;
}

/** Visitor-facing Entry-cost text for summaries and details. */
export function entryCostText(facts: EntryCostFacts) {
  switch (facts.kind) {
    case "free":
      return "Free";
    case "fixed":
      return formatIdr(facts.amountIdr);
    case "range":
      return `${formatIdr(facts.minIdr)} – ${formatIdr(facts.maxIdr)}`;
    case "unknown":
      return "Cost unknown";
  }
}

/** Visitor-facing Operating-hours text for summaries and details. */
export function operatingHoursText(facts: OperatingHoursFacts) {
  switch (facts.kind) {
    case "unknown":
      return "Hours unknown";
    case "unrestricted":
      return "No meaningful restriction";
    case "periods":
      return facts.text;
  }
}

import type { Coordinates } from "./coordinates";

export type FerryTerminal = {
  name: string;
  coordinates: Coordinates;
};

/**
 * Ferry terminals supported as same-day Trip anchors. Names are persisted in
 * the Trip while coordinates remain a single planner-owned geographic fact.
 */
export const FERRY_TERMINALS: readonly FerryTerminal[] = [
  {
    name: "Batam Centre Ferry Terminal",
    coordinates: { latitude: 1.1306, longitude: 104.0556 },
  },
  {
    name: "Harbour Bay Ferry Terminal",
    coordinates: { latitude: 1.1531, longitude: 104.0007 },
  },
  {
    name: "Nongsapura Ferry Terminal",
    coordinates: { latitude: 1.1967, longitude: 104.0974 },
  },
  {
    name: "Sekupang Ferry Terminal",
    coordinates: { latitude: 1.1272, longitude: 103.9283 },
  },
  {
    name: "Waterfront Ferry Terminal",
    coordinates: { latitude: 1.0827, longitude: 103.9192 },
  },
] as const;

export function findFerryTerminal(name: string): FerryTerminal | null {
  const normalized = name.trim().toLocaleLowerCase("en");
  return (
    FERRY_TERMINALS.find(
      (terminal) => terminal.name.toLocaleLowerCase("en") === normalized,
    ) ?? null
  );
}

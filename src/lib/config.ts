// Admin-configurable settings. Shared by server and client code (no server-only imports).
// Stored in Realtime Database under settings/electricity and settings/general; the constants
// below are the fallbacks used until the admin saves something.

export interface ElectricityConfig {
  /** ₹ per unit. */
  ratePerUnit: number;
  /** Flat bill (₹) for plots in `highPlots` when no meter reading has been entered. */
  defaultHigh: number;
  /** Flat bill (₹) for every other plot when no meter reading has been entered. */
  defaultStandard: number;
  /** Plots billed `defaultHigh` when unread (by default the first plot on each floor). */
  highPlots: string[];
  /** Money paid above rent counts as electricity only when under this limit; larger is rent paid ahead. */
  excessLimit: number;
}

export interface GeneralSettings {
  buildingName: string;
  /** Tenants can sign in on the public page to see their own account. */
  portalEnabled: boolean;
  /** Optional message shown to tenants on the public page (e.g. "Rent is due by the 5th"). */
  notice: string;
}

export const DEFAULT_ELECTRICITY_CONFIG: ElectricityConfig = {
  ratePerUnit: 7,
  defaultHigh: 750,
  defaultStandard: 500,
  highPlots: ["101", "201", "301", "401", "501"],
  excessLimit: 1500,
};

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  buildingName: process.env.BUILDING_NAME || "SJR Building",
  portalEnabled: true,
  notice: "",
};

const num = (value: unknown, fallback: number, min = 0, max = 10_000_000) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? Math.round(value * 100) / 100 : fallback;

/** Parses "101, 201 301" or an array into a clean list of unique plot numbers. */
export function parsePlotList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [];
  return [...new Set(items.map((v) => String(v).trim()).filter(Boolean))].slice(0, 200);
}

/** Fills any missing or invalid field with its default, so partial or legacy documents still work. */
export function normalizeElectricityConfig(value: Partial<Record<keyof ElectricityConfig, unknown>> | null | undefined): ElectricityConfig {
  const d = DEFAULT_ELECTRICITY_CONFIG;
  return {
    ratePerUnit: num(value?.ratePerUnit, d.ratePerUnit, 0, 1000),
    defaultHigh: num(value?.defaultHigh, d.defaultHigh),
    defaultStandard: num(value?.defaultStandard, d.defaultStandard),
    // Stored as a comma-separated string because Realtime Database drops empty arrays.
    highPlots: Array.isArray(value?.highPlots) || typeof value?.highPlots === "string" ? parsePlotList(value?.highPlots) : d.highPlots,
    excessLimit: num(value?.excessLimit, d.excessLimit),
  };
}

export function normalizeGeneralSettings(value: Partial<Record<keyof GeneralSettings, unknown>> | null | undefined): GeneralSettings {
  const d = DEFAULT_GENERAL_SETTINGS;
  const name = typeof value?.buildingName === "string" ? value.buildingName.trim().slice(0, 100) : "";
  return {
    buildingName: name || d.buildingName,
    portalEnabled: typeof value?.portalEnabled === "boolean" ? value.portalEnabled : d.portalEnabled,
    notice: typeof value?.notice === "string" ? value.notice.trim().slice(0, 500) : d.notice,
  };
}

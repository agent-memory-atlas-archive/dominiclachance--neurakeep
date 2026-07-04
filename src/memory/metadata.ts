export const memorySpaces = ["personal", "project", "system", "team", "client", "enterprise"] as const;
export const activeMemorySpaces = ["personal", "project", "system"] as const;
export const trustLevels = ["untrusted", "observed", "trusted", "verified"] as const;
export const sourceOrigins = [
  "manual",
  "local_file",
  "session",
  "agent",
  "connector",
  "import",
  "system"
] as const;
export const visibilityLevels = ["private", "space", "team", "client", "public"] as const;
export const sensitivityLevels = ["normal", "internal", "confidential", "secret"] as const;

export type MemorySpace = (typeof memorySpaces)[number];
export type TrustLevel = (typeof trustLevels)[number];
export type SourceOrigin = (typeof sourceOrigins)[number];
export type Visibility = (typeof visibilityLevels)[number];
export type Sensitivity = (typeof sensitivityLevels)[number];

export interface MemoryMetadata {
  space: MemorySpace;
  trustLevel: TrustLevel;
  sourceOrigin: SourceOrigin;
  visibility: Visibility;
  sensitivity: Sensitivity;
}

export const defaultMemoryMetadata: MemoryMetadata = {
  space: "personal",
  trustLevel: "observed",
  sourceOrigin: "local_file",
  visibility: "private",
  sensitivity: "normal"
};

export function parseEnumValue<T extends readonly string[]>(
  values: T,
  value: string | undefined,
  name: string,
  fallback: T[number]
): T[number] {
  if (!value) {
    return fallback;
  }

  if ((values as readonly string[]).includes(value)) {
    return value as T[number];
  }

  throw new Error(`${name} must be one of: ${values.join(", ")}`);
}

import type { NarrativeCheckResponse, NarrativeConsistencyOutcome } from "../domain.ts";

/** Returns the fixture-backed narrative mock response after validating prompt injection. */
export function createMockNarrativeResponse(
  systemPrompt: string,
  outcome: NarrativeConsistencyOutcome,
): NarrativeCheckResponse {
  if (!systemPrompt.includes("<INPUT_JSON>")) {
    throw new Error("Narrative mock received an invalid system prompt.");
  }
  return { outcome };
}

import { readFileSync } from "node:fs";
import { createFixtureNarrativeConsistencyChecker } from "../src/narrative-consistency.ts";
import type { NarrativeConsistencyChecker, W2Input } from "../src/domain.ts";

const synthetic = JSON.parse(
  readFileSync(new URL("../data/synthetic/w2-cases.json", import.meta.url), "utf8"),
) as { aligned: W2Input };

export function alignedInput(): W2Input {
  return structuredClone(synthetic.aligned);
}

/** Returns the explicit nominal narrative-check fixture used by existing economic tests. */
export function consistentNarrativeChecker(): NarrativeConsistencyChecker {
  return createFixtureNarrativeConsistencyChecker("CONSISTENT");
}

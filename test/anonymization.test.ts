import assert from "node:assert/strict";
import test from "node:test";
import {
  PiiAnonymizationWrapper,
  evaluateLiquidationWithPiiProtection,
} from "../src/index.ts";
import type { NarrativeConsistencyChecker } from "../src/domain.ts";
import { alignedInput } from "./fixtures.ts";

test("sanitizes nested documents without mutating input and restores output", () => {
  const wrapper = new PiiAnonymizationWrapper(["Mario Rossi", "mario@example.com"]);
  const documents = {
    narrative: "Mario Rossi reported the incident.",
    contacts: [{ email: "mario@example.com" }],
  };

  const sanitized = wrapper.sanitize(documents);

  assert.deepEqual(sanitized, {
    narrative: "[PII_001] reported the incident.",
    contacts: [{ email: "[PII_002]" }],
  });
  assert.deepEqual(documents, {
    narrative: "Mario Rossi reported the incident.",
    contacts: [{ email: "mario@example.com" }],
  });

  assert.deepEqual(
    wrapper.restore({ message: sanitized.narrative, email: sanitized.contacts[0]!.email }),
    { message: "Mario Rossi reported the incident.", email: "mario@example.com" },
  );
});

test("uses one placeholder for repeated PII values", () => {
  const wrapper = new PiiAnonymizationWrapper(["Mario Rossi"]);

  assert.deepEqual(
    wrapper.sanitize({ first: "Mario Rossi", second: "Mario Rossi called Mario Rossi." }),
    { first: "[PII_001]", second: "[PII_001] called [PII_001]." },
  );
});

test("runs W2 on sanitized narratives and restores the proposal output", () => {
  const input = alignedInput();
  input.practice.narrative = "Mario Rossi reported front bumper damage.";
  input.appraisal.narrative = "Inspection confirms damage reported by Mario Rossi.";
  let checkerInput = "";
  const checker: NarrativeConsistencyChecker = {
    check(input) {
      checkerInput = input.claimNarrative;
      return {
        response: { outcome: "CONSISTENT" },
        sourceRefs: input.sourceRefs,
      };
    },
  };

  const result = evaluateLiquidationWithPiiProtection(input, checker, ["Mario Rossi"], "seed-001");

  assert.equal(checkerInput, "[PII_001] reported front bumper damage.");
  assert.match(result.motivation.response, /Mario Rossi/);
  assert.doesNotMatch(checkerInput, /Mario Rossi/);
  assert.equal(input.practice.narrative, "Mario Rossi reported front bumper damage.");
});

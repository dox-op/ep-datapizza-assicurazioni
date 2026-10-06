import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeLiquidation,
  createFixtureNarrativeConsistencyChecker,
} from "../src/index.ts";
import { alignedInput } from "./fixtures.ts";

test("contradictory narratives block liquidation and leave the amount not computable", () => {
  const input = alignedInput();
  Object.assign(input.practice, { narrative: "The vehicle suffered rear-end collision damage." });
  Object.assign(input.appraisal, { narrative: "No collision damage was found on the vehicle." });

  const result = analyzeLiquidation(
    input,
    createFixtureNarrativeConsistencyChecker("CONTRADICTS"),
  );

  assert.equal(result.proposedDecision, "DO_NOT_LIQUIDATE");
  assert.equal(result.payableAmount, null);
  assert.equal(result.amountStatus, "NOT_COMPUTABLE");
  assert.equal(result.requiresHumanReview, true);
  assert.equal(result.narrativeCheck?.response.outcome, "CONTRADICTS");
  assert.equal("outcome" in (result.narrativeCheck ?? {}), false);
  assert.deepEqual(result.narrativeCheck?.response, { outcome: "CONTRADICTS" });
  assert.doesNotMatch(JSON.stringify(result), /systemPrompt/);
});

test("consistent narratives preserve the economic proposal", () => {
  const input = alignedInput();
  Object.assign(input.practice, { narrative: "The vehicle suffered rear-end collision damage." });
  Object.assign(input.appraisal, { narrative: "Rear-end collision damage was found on the vehicle." });

  const result = analyzeLiquidation(
    input,
    createFixtureNarrativeConsistencyChecker("CONSISTENT"),
  );

  assert.equal(result.proposedDecision, "LIQUIDATE");
  assert.deepEqual(result.payableAmount, { minorUnits: 90_00, currency: "EUR" });
  assert.equal(result.narrativeCheck?.response.outcome, "CONSISTENT");
  assert.equal("outcome" in (result.narrativeCheck ?? {}), false);
});

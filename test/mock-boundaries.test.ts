import assert from "node:assert/strict";
import test from "node:test";
import { buildNarrativeConsistencySystemPrompt } from "../src/narrative-consistency.ts";
import { createMockNarrativeResponse } from "../src/mocks/narrative-consistency.ts";
import {
  MOTIVATION_CATALOG,
  createMockMotivationResponse,
} from "../src/mocks/motivation.ts";
import type { DeterministicAnalysis, MotivationFacts, NarrativeCheckInput } from "../src/domain.ts";

const analysis: DeterministicAnalysis = {
  claimId: "CLM-001",
  proposedDecision: "LIQUIDATE",
  payableAmount: { minorUnits: 9_000, currency: "EUR" },
  amountStatus: "COMPUTED",
  requiresHumanReview: false,
  issues: [],
  lineComparisons: [],
  ruleVersion: "w2-v0.1",
};

const facts: MotivationFacts = {
  claim: { claimId: "CLM-001", narrative: "Claim narrative", sourceRef: "claim://CLM-001" },
  appraisal: { narrative: "Appraisal narrative", total: null, sourceRef: "appraisal://APP-001" },
  invoice: { total: null, sourceRef: "invoice://INV-001" },
  policy: { covered: true, limit: null, deductible: null, sourceRef: "policy://POL-001" },
  documents: { appraisalTotal: null, invoiceTotal: null, appraisalLines: [], invoiceLines: [] },
};

test("motivation mock boundary exposes 100 deterministic templates", () => {
  const first = createMockMotivationResponse("SOURCE_FACTS_JSON:", analysis, facts, "seed-001");
  const second = createMockMotivationResponse("SOURCE_FACTS_JSON:", analysis, facts, "seed-001");

  assert.equal(MOTIVATION_CATALOG.length, 100);
  assert.equal(new Set(MOTIVATION_CATALOG).size, 100);
  assert.deepEqual(first, second);
});

test("narrative mock boundary accepts only a prompt with injected input", () => {
  const input: NarrativeCheckInput = {
    claimNarrative: "Claim narrative",
    appraisalNarrative: "Appraisal narrative",
    sourceRefs: ["claim://CLM-001", "appraisal://APP-001"],
  };
  const prompt = buildNarrativeConsistencySystemPrompt(input);

  assert.deepEqual(createMockNarrativeResponse(prompt, "CONSISTENT"), { outcome: "CONSISTENT" });
  assert.throws(
    () => createMockNarrativeResponse("invalid prompt", "CONSISTENT"),
    /invalid system prompt/,
  );
});

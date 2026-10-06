import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  DeterministicAnalysis,
  Evidence,
  LiquidationProposal,
} from "./domain.ts";
import { analyzeLiquidation } from "./liquidation.ts";
import { composeMotivation } from "./motivation.ts";
import { createFixtureNarrativeConsistencyChecker } from "./narrative-consistency.ts";
import {
  adaptMockBundle,
  authenticateMockSystems,
  detectW3Referral,
  extractSourceRefs,
  loadMockBundle,
  MockIntegrationError,
  SYNTHETIC_AUTH_TOKEN,
} from "./mocks/external-systems.ts";
import type {
  MockErrorCode,
  MockFault,
  MockSourceRefs,
} from "./mocks/external-systems.ts";

export type { MockFault } from "./mocks/external-systems.ts";

export type W2MockRunOptions = {
  authToken?: string;
  fault?: MockFault;
  seed?: string;
};

export type W2RunErrorCode =
  | MockErrorCode
  | "UNEXPECTED_RUNNER_ERROR";

export type W2RunStage = "AUTHENTICATION" | "INGESTION" | "RUNNER";

export type W2RunError = {
  code: W2RunErrorCode;
  message: string;
  retryable: boolean;
  stage: W2RunStage;
};

export type W3Referral = import("./mocks/external-systems.ts").W3Referral;

export type W2Routing = {
  next: "W2" | "W3" | "HUMAN_REVIEW";
  referral: W3Referral | null;
};

export type W2SourceRefs = MockSourceRefs;

export type W2ExecutionResult =
  | {
      status: "COMPLETED";
      sources: W2SourceRefs;
      routing: W2Routing;
      proposal: LiquidationProposal;
    }
  | {
      status: "FAILED";
      error: W2RunError;
    };

/** Blocks liquidation while preserving the deterministic candidate amount and W3 evidence. */
function applyW3Referral(
  analysis: DeterministicAnalysis,
  referral: W3Referral,
): DeterministicAnalysis {
  const referralEvidence: Evidence = {
    code: "W3_REFERRAL",
    message: referral.message,
    sourceRefs: referral.sourceRefs,
  };
  return {
    ...analysis,
    proposedDecision: "DO_NOT_LIQUIDATE",
    requiresHumanReview: true,
    issues: [...analysis.issues, referralEvidence],
  };
}

/** Selects the next local test-run destination from referral and human-review state. */
function buildRouting(
  analysis: DeterministicAnalysis,
  referral: W3Referral | null,
): W2Routing {
  return {
    next: referral ? "W3" : analysis.requiresHumanReview ? "HUMAN_REVIEW" : "W2",
    referral,
  };
}

/** Persists a complete wrapper outcome, including controlled failures. */
function persistOutcome(outputPath: string, result: W2ExecutionResult): void {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

/** Reads external mocks, simulates auth, executes W2, and persists a test outcome. */
export function runW2MockBundle(
  directory: string,
  outputPath: string,
  options: W2MockRunOptions = {},
): W2ExecutionResult {
  try {
    authenticateMockSystems(options.authToken ?? SYNTHETIC_AUTH_TOKEN, options.fault);
    const bundle = loadMockBundle(directory, options.fault);
    const input = adaptMockBundle(bundle);
    const checker = createFixtureNarrativeConsistencyChecker(bundle.practice.record.narrativeCheckFixture);
    const initialAnalysis = analyzeLiquidation(input, checker);
    const referral = detectW3Referral(bundle, initialAnalysis);
    const analysis = referral ? applyW3Referral(initialAnalysis, referral) : initialAnalysis;
    const proposal: LiquidationProposal = {
      ...analysis,
      motivation: composeMotivation(
        input,
        analysis,
        options.seed ?? bundle.practice.record.claimId,
      ),
    };
    const result: W2ExecutionResult = {
      status: "COMPLETED",
      sources: extractSourceRefs(bundle),
      routing: buildRouting(analysis, referral),
      proposal,
    };
    persistOutcome(outputPath, result);
    return result;
  } catch (error) {
    const runError = error instanceof MockIntegrationError
      ? {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
          stage: error.stage,
        }
      : {
          code: "UNEXPECTED_RUNNER_ERROR" as const,
          message: "Unexpected synthetic runner failure.",
          retryable: false,
          stage: "RUNNER" as const,
        };
    const result: W2ExecutionResult = { status: "FAILED", error: runError };
    persistOutcome(outputPath, result);
    return result;
  }
}

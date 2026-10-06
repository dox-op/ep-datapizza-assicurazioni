import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Appraisal,
  DeterministicAnalysis,
  Invoice,
  Money,
  NarrativeConsistencyOutcome,
  PolicyConditions,
  Practice,
  W2Input,
} from "../domain.ts";

export const SYNTHETIC_AUTH_TOKEN = "synthetic-valid-token";

export const SOURCE_FILES = {
  practice: "gestionale-sinistri-practice-clm-001.json",
  appraisal: "servizio-periti-appraisal-app-001.json",
  invoice: "archivio-documentale-invoice-inv-001.json",
  policy: "sistema-polizze-policy-pol-001.json",
} as const;

export const EXPECTED_SOURCE_SYSTEMS = {
  practice: "Gestionale Sinistri",
  appraisal: "Servizio Periti",
  invoice: "Archivio documentale",
  policy: "Sistema Polizze",
} as const;

export const W3_THRESHOLD_PERCENT = 30;

export type MockFault =
  | "AUTHENTICATION_FAILURE"
  | "MISSING_APPRAISAL"
  | "INVALID_INVOICE";

export type MockErrorCode =
  | "AUTHENTICATION_FAILED"
  | "MISSING_SOURCE_FILE"
  | "INVALID_SOURCE_FILE";

export type MockStage = "AUTHENTICATION" | "INGESTION";

export type ExternalRecord<T> = {
  sourceSystem: string;
  sourceRef: string;
  record: T;
};

export type ExternalPractice = Practice & {
  narrativeCheckFixture: NarrativeConsistencyOutcome;
};

export type LoadedMockBundle = {
  practice: ExternalRecord<ExternalPractice>;
  appraisal: ExternalRecord<Appraisal>;
  invoice: ExternalRecord<Invoice>;
  policy: ExternalRecord<PolicyConditions>;
};

export type MockSourceRefs = {
  practice: string;
  appraisal: string;
  invoice: string;
  policy: string;
};

export type W3Referral = {
  code: "INVOICE_ABOVE_APPRAISAL_THRESHOLD" | "UNESTIMATED_INVOICE";
  message: string;
  thresholdPercent: number;
  variancePercent: number | null;
  appraisalAmount: Money;
  invoiceAmount: Money;
  sourceRefs: string[];
};

/** Represents a controlled failure at the synthetic integration boundary. */
export class MockIntegrationError extends Error {
  public readonly code: MockErrorCode;
  public readonly retryable = false;
  public readonly stage: MockStage;

  constructor(code: MockErrorCode, message: string, stage: MockStage) {
    super(message);
    this.code = code;
    this.stage = stage;
  }
}

/** Simulates a shared credential check before reading any external-system mock. */
export function authenticateMockSystems(token: string, fault?: MockFault): void {
  if (fault === "AUTHENTICATION_FAILURE" || token !== SYNTHETIC_AUTH_TOKEN) {
    throw new MockIntegrationError(
      "AUTHENTICATION_FAILED",
      "Synthetic external-system authentication failed.",
      "AUTHENTICATION",
    );
  }
}

/** Reads one external-system envelope and validates its source contract. */
function readExternalRecord<T>(
  directory: string,
  entity: keyof typeof SOURCE_FILES,
): ExternalRecord<T> {
  const fileName = SOURCE_FILES[entity];
  const filePath = join(directory, fileName);
  let raw: string;

  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    throw new MockIntegrationError(
      "MISSING_SOURCE_FILE",
      `Required mock source file is unavailable: ${fileName}.`,
      "INGESTION",
    );
  }

  let parsed: Partial<ExternalRecord<T>>;
  try {
    parsed = JSON.parse(raw) as Partial<ExternalRecord<T>>;
  } catch {
    throw new MockIntegrationError(
      "INVALID_SOURCE_FILE",
      `Invalid JSON in mock source file: ${fileName}.`,
      "INGESTION",
    );
  }

  if (
    parsed.sourceSystem !== EXPECTED_SOURCE_SYSTEMS[entity] ||
    !parsed.sourceRef ||
    !parsed.record
  ) {
    throw new MockIntegrationError(
      "INVALID_SOURCE_FILE",
      `Invalid mock source envelope: ${fileName}.`,
      "INGESTION",
    );
  }

  return parsed as ExternalRecord<T>;
}

/** Loads all four normalized external-system mocks after authentication succeeds. */
export function loadMockBundle(directory: string, fault?: MockFault): LoadedMockBundle {
  if (fault === "MISSING_APPRAISAL") {
    throw new MockIntegrationError(
      "MISSING_SOURCE_FILE",
      `Required mock source file is unavailable: ${SOURCE_FILES.appraisal}.`,
      "INGESTION",
    );
  }

  const bundle = {
    practice: readExternalRecord<ExternalPractice>(directory, "practice"),
    appraisal: readExternalRecord<Appraisal>(directory, "appraisal"),
    invoice: readExternalRecord<Invoice>(directory, "invoice"),
    policy: readExternalRecord<PolicyConditions>(directory, "policy"),
  } satisfies LoadedMockBundle;

  if (!bundle.practice.record.narrativeCheckFixture) {
    throw new MockIntegrationError(
      "INVALID_SOURCE_FILE",
      `Practice mock does not declare narrativeCheckFixture: ${SOURCE_FILES.practice}.`,
      "INGESTION",
    );
  }

  if (fault === "INVALID_INVOICE") {
    bundle.invoice = {
      ...bundle.invoice,
      record: {
        ...bundle.invoice.record,
        claimId: `${bundle.invoice.record.claimId}-FAULT`,
      },
    };
  }

  return bundle;
}

/** Adapts source records to the normalized aggregate consumed by the W2 core. */
export function adaptMockBundle(bundle: LoadedMockBundle): W2Input {
  return {
    practice: bundle.practice.record,
    appraisal: bundle.appraisal.record,
    invoice: bundle.invoice.record,
    policy: bundle.policy.record,
  };
}

/** Extracts source references retained in the completed test outcome. */
export function extractSourceRefs(bundle: LoadedMockBundle): MockSourceRefs {
  return {
    practice: bundle.practice.sourceRef,
    appraisal: bundle.appraisal.sourceRef,
    invoice: bundle.invoice.sourceRef,
    policy: bundle.policy.sourceRef,
  };
}

/** Builds a W3 referral when invoice cost exceeds the synthetic appraisal threshold. */
export function detectW3Referral(
  bundle: LoadedMockBundle,
  analysis: DeterministicAnalysis,
): W3Referral | null {
  if (
    analysis.amountStatus === "NOT_COMPUTABLE" ||
    analysis.narrativeCheck?.response.outcome !== "CONSISTENT"
  ) {
    return null;
  }

  const appraisalAmount = bundle.appraisal.record.total;
  const invoiceAmount = bundle.invoice.record.total;
  if (
    appraisalAmount.currency !== invoiceAmount.currency ||
    invoiceAmount.minorUnits <= appraisalAmount.minorUnits
  ) {
    return null;
  }

  if (appraisalAmount.minorUnits === 0) {
    return {
      code: "UNESTIMATED_INVOICE",
      message: "Invoice contains a positive amount without an appraisal baseline.",
      thresholdPercent: W3_THRESHOLD_PERCENT,
      variancePercent: null,
      appraisalAmount,
      invoiceAmount,
      sourceRefs: [bundle.appraisal.sourceRef, bundle.invoice.sourceRef],
    };
  }

  const variancePercent = Number(
    (((invoiceAmount.minorUnits - appraisalAmount.minorUnits) / appraisalAmount.minorUnits) * 100).toFixed(2),
  );
  if (variancePercent <= W3_THRESHOLD_PERCENT) {
    return null;
  }

  return {
    code: "INVOICE_ABOVE_APPRAISAL_THRESHOLD",
    message: "Invoice exceeds appraisal by more than the synthetic W3 threshold.",
    thresholdPercent: W3_THRESHOLD_PERCENT,
    variancePercent,
    appraisalAmount,
    invoiceAmount,
    sourceRefs: [bundle.appraisal.sourceRef, bundle.invoice.sourceRef],
  };
}

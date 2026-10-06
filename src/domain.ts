export type Money = {
  minorUnits: number;
  currency: string;
};

export type SourceRef = string;

export type NarrativeConsistencyOutcome = "CONSISTENT" | "CONTRADICTS";

export type NarrativeCheckInput = {
  claimNarrative: string;
  appraisalNarrative: string;
  sourceRefs: SourceRef[];
};

export type NarrativeCheckResponse = {
  outcome: NarrativeConsistencyOutcome;
};

export type NarrativeCheck = {
  response: NarrativeCheckResponse;
  sourceRefs: SourceRef[];
};

export interface NarrativeConsistencyChecker {
  check(input: NarrativeCheckInput): NarrativeCheck;
}

export type LineItem = {
  itemCode: string;
  description: string;
  quantity: number;
  total: Money;
  sourceRef: SourceRef;
};

export type Practice = {
  claimId: string;
  policyId: string;
  narrative: string;
  currency: string;
  sourceRef: SourceRef;
};

export type Appraisal = {
  appraisalId: string;
  claimId: string;
  narrative: string;
  lines: LineItem[];
  total: Money;
  sourceRef: SourceRef;
};

export type Invoice = {
  invoiceId: string;
  claimId: string;
  lines: LineItem[];
  total: Money;
  sourceRef: SourceRef;
};

export type PolicyConditions = {
  policyId: string;
  claimId: string;
  covered: boolean;
  limit: Money;
  deductible: Money;
  sourceRef: SourceRef;
};

export type W2Input = {
  practice: Practice;
  appraisal: Appraisal;
  invoice: Invoice;
  policy: PolicyConditions;
};

export type ProposedDecision = "LIQUIDATE" | "DO_NOT_LIQUIDATE";

export type Evidence = {
  code: string;
  message: string;
  sourceRefs: SourceRef[];
};

export type LineComparison = {
  itemCode: string;
  appraisalAmount: Money;
  invoiceAmount: Money;
  candidateAmount: Money;
  matches: boolean;
  evidence: Evidence;
};

export type DeterministicAnalysis = {
  claimId: string;
  proposedDecision: ProposedDecision;
  payableAmount: Money | null;
  amountStatus: "COMPUTED" | "ZERO" | "NOT_COMPUTABLE";
  requiresHumanReview: boolean;
  issues: Evidence[];
  narrativeCheck?: NarrativeCheck;
  lineComparisons: LineComparison[];
  ruleVersion: string;
};

export type Motivation = {
  index: number;
  seed: string;
  response: string;
  facts: MotivationFacts;
};

export type MotivationFacts = {
  claim: {
    claimId: string;
    narrative: string;
    sourceRef: SourceRef;
  };
  appraisal: {
    narrative: string;
    total: Money | null;
    sourceRef: SourceRef;
  };
  invoice: {
    total: Money | null;
    sourceRef: SourceRef;
  };
  policy: {
    covered: boolean | null;
    limit: Money | null;
    deductible: Money | null;
    sourceRef: SourceRef;
  };
  documents: {
    appraisalTotal: Money | null;
    invoiceTotal: Money | null;
    appraisalLines: Array<{ itemCode: string; amount: Money; sourceRef: SourceRef }>;
    invoiceLines: Array<{ itemCode: string; amount: Money; sourceRef: SourceRef }>;
  };
};

export type LiquidationProposal = DeterministicAnalysis & {
  motivation: Motivation;
};

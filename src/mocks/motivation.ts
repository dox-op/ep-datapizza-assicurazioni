import type { DeterministicAnalysis, MotivationFacts, Money } from "../domain.ts";

const openings = [
  "Il confronto documentale evidenzia",
  "L'analisi delle fonti disponibili rileva",
  "La verifica deterministica mostra",
  "La proposta è basata su",
  "La valutazione delle evidenze indica",
  "Il riscontro tra perizia e fattura conferma",
  "La ricostruzione dell'importo considera",
  "Il controllo delle condizioni applica",
  "La sintesi per il liquidatore riporta",
  "L'esame dei dati normalizzati rileva",
] as const;

const conclusions = [
  "coerenza tra le voci esaminate",
  "il massimale e la franchigia previsti",
  "un importo candidato verificabile",
  "le fonti associate a ogni evidenza",
  "la necessità di mantenere il controllo umano",
  "una divergenza da verificare prima dell'esito finale",
  "un calcolo riproducibile sulla stessa pratica",
  "l'assenza di dati sufficienti per una liquidazione automatica",
  "un esito proposto separato dalla decisione finale",
  "le regole della versione di analisi dichiarata",
] as const;

export const MOTIVATION_CATALOG: readonly string[] = Object.freeze(
  openings.flatMap((opening) => conclusions.map((conclusion) => `${opening} ${conclusion}.`)),
);

/** Selects a stable catalog index from a seed without using randomness. */
function stableIndex(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % MOTIVATION_CATALOG.length;
}

/** Formats a money value for the deterministic motivation output. */
function formatMoney(value: Money | null): string {
  return value ? `${value.minorUnits} ${value.currency}` : "non disponibile";
}

/** Builds a compact line-item summary for the deterministic motivation output. */
function formatLines(lines: Array<{ itemCode: string; amount: Money; sourceRef: string }>): string {
  return lines.length > 0
    ? lines.map((line) => `${line.itemCode}=${formatMoney(line.amount)} [${line.sourceRef}]`).join(", ")
    : "nessuna voce";
}

/** Returns the deterministic mock LLM response after validating prompt injection. */
export function createMockMotivationResponse(
  systemPrompt: string,
  analysis: DeterministicAnalysis,
  facts: MotivationFacts,
  seed: string,
): { index: number; response: string } {
  if (!systemPrompt.includes("SOURCE_FACTS_JSON:")) {
    throw new Error("Motivation mock received an invalid system prompt.");
  }
  const index = stableIndex(`${seed}\n${JSON.stringify(analysis)}`);
  const template = MOTIVATION_CATALOG[index];
  const amount = analysis.payableAmount
    ? `${analysis.payableAmount.minorUnits} ${analysis.payableAmount.currency} in unità minime`
    : "non calcolabile";
  const review = analysis.requiresHumanReview ? "Controllo umano richiesto." : "Controllo umano non richiesto.";
  const coverage = facts.policy.covered === true ? "attiva" : facts.policy.covered === false ? "assente" : "non disponibile";

  return {
    index,
    response: `${template} Sinistro: ${facts.claim.narrative}. Perizia narrativa: ${facts.appraisal.narrative}. Copertura: ${coverage}. Massimale: ${formatMoney(facts.policy.limit)}. Franchigia: ${formatMoney(facts.policy.deductible)}. Perizia: ${formatMoney(facts.documents.appraisalTotal)} (${formatLines(facts.documents.appraisalLines)}). Fattura: ${formatMoney(facts.documents.invoiceTotal)} (${formatLines(facts.documents.invoiceLines)}). Esito proposto: ${analysis.proposedDecision}. Importo liquidabile: ${amount}. ${review}`,
  };
}

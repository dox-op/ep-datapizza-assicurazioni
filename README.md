# W2 — proposta di liquidazione

Implementazione locale, parziale e deterministica di parte di W2. Riceve `Pratica`, `Perizia`, `Fattura` e `CondizioniPolizza` già normalizzate e produce una proposta: decisione binaria, importo, evidenze e motivazione.

Documento di consegna: [`docs/DELIVERY.md`](docs/DELIVERY.md).

## Topologia

```text
mock JS ON dei sistemi esterni
        |
        v
scripts/run-w2.ts
        |
        v
src/file-runner.ts       auth simulata, validazione envelope, adapter, routing W3
        |
        v
src/liquidation.ts       analisi deterministica W2
        |                 pratica · perizia · fattura · polizza
        +--> src/narrative-consistency.ts   check fixture-driven
        +--> src/motivation.ts              motivazione mock deterministica
        +--> src/anonymization.ts           wrapper PII opzionale
        |
        v
tmp/*.json                outcome persistito
```

Il runner locale simula sistemi esterni e autenticazione. Nessuna rete. Funzioni implementate ricevono dati già normalizzati.

## Mappa del codice

| Percorso | Responsabilità |
|---|---|
| `src/domain.ts` | Tipi di dominio, input W2, proposta, evidenze, narrativa e outcome. |
| `src/liquidation.ts` | Validazione, confronto voci, massimale/franchigia, proposta fail-closed. |
| `src/narrative-consistency.ts` | Check narrativo fixture-driven: `CONSISTENT` o `CONTRADICTS`. |
| `src/motivation.ts` | Fatti, system prompt e composizione della motivazione. |
| `src/mocks/` | Implementazioni e valorizzazioni dei mock isolati dal codice di dominio. |
| `src/anonymization.ts` | Sostituzione/ripristino letterale di PII nei documenti JSON. |
| `src/file-runner.ts` | Ingestion dei mock, auth simulata, fault injection, referral W3 e persistenza outcome. |
| `src/index.ts` | API pubblica |
| `scripts/` | Runner CLI nominale e due scenari sintetici. |
| `test/` | Test di dominio, harness, PII, ingestion, fault, routing ed evaluation mockata. |
| `data/synthetic/external-systems/` | Quattro envelope JSON normalizzati letti dal runner. |
| `data/synthetic/scenarios/` | Bundle per referral W3 e contraddizione narrativa. |
| `docs/DELIVERY.md` | Documento di consegna per i punti 1, 3, 4 e 5. |

## Esecuzione

Requisito: Node.js 24+.

Comando unico per test e run nominale:

```bash
npm run verify
```

Esegue test, run nominale e due scenari. Scrive output in `tmp/`.

Run parametrico:

```bash
npm run run:synthetic -- data/synthetic/external-systems tmp/w2-output.json
```

Il comando legge i quattro file JSON normalizzati, usa `synthetic-valid-token` come token predefinito e salva l'outcome completo.

Fault injection:

```bash
npm run run:synthetic -- data/synthetic/external-systems tmp/w2-auth-error.json --fault=AUTHENTICATION_FAILURE
npm run run:synthetic -- data/synthetic/external-systems tmp/w2-missing-appraisal.json --fault=MISSING_APPRAISAL
npm run run:synthetic -- data/synthetic/external-systems tmp/w2-invalid-invoice.json --fault=INVALID_INVOICE
```

Scenari:

```bash
npm run run:w3-trigger
npm run run:narrative-contradiction
```

- `w3-trigger`: fattura EUR 150, perizia EUR 100, scostamento 50% oltre soglia harness 30%; routing `W3`, proposta `DO_NOT_LIQUIDATE`.
- `narrative-contradiction`: fixture `CONTRADICTS`; routing `HUMAN_REVIEW`, proposta `DO_NOT_LIQUIDATE`, importo `null`.

## Mock sintetici

Il runner legge `data/synthetic/external-systems/`:

| File | Sistema simulato | Dato |
|---|---|---|
| `gestionale-sinistri-practice-clm-001.json` | Gestionale Sinistri | Pratica, narrativa, `claimId`, `policyId`. |
| `servizio-periti-appraisal-app-001.json` | Servizio Periti | Perizia, righe e totale. |
| `archivio-documentale-invoice-inv-001.json` | Archivio documentale | Fattura, righe e totale. |
| `sistema-polizze-policy-pol-001.json` | Sistema Polizze | Copertura, massimale, franchigia e regole. |

## Regole osservabili

- Check narrativo prima del calcolo economico.
- `CONTRADICTS` -> `DO_NOT_LIQUIDATE`, importo non calcolabile, controllo umano.
- Candidato per voce = minore tra perizia e fattura.
- Massimale applicato prima della franchigia.
- Input incoerente -> proposta fail-closed.
- Motivazione mock -> non modifica decisione, evidenze, importo o controllo umano.
- Mock LLM, replay e test sono deterministici; nessuna rete e nessun `Math.random()`.

Le soglie evaluation e la soglia produttiva W3 sono ipotesi da validare con il cliente.

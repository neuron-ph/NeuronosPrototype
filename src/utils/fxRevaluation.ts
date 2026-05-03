/**
 * Period-end FX revaluation.
 *
 * Marks open foreign-currency balances to the period-end spot rate and posts
 * the unrealized gain/loss against accounts 4530/7030. The companion reversing
 * entry is dated day-1 of the next period so net P&L impact is only recognized
 * when the position settles (becoming realized FX in 4510/7010).
 */

import {
  FX_UNREALIZED_GAIN_CODE,
  FX_UNREALIZED_LOSS_CODE,
  roundMoney,
  toBaseAmount,
} from "./accountingCurrency";

export interface OpenForeignPosition {
  recordId: string;
  recordType: "invoice" | "evoucher";
  revaluationClass: "receivable" | "payable";
  accountId: string;
  accountCode: string;
  accountName: string;
  currency: "USD";
  originalAmount: number;
  carryingRate: number;
  carryingBase: number;
}

export interface RevaluationLineCalc {
  position: OpenForeignPosition;
  newRate: number;
  newBase: number;
  delta: number;
}

export interface RevaluationSummary {
  asOfDate: string;
  reversalDate: string;
  lines: RevaluationLineCalc[];
  totalDelta: number;
  idempotencyKey: string;
}

function toIso(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().slice(0, 10);
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function computeRevaluation(params: {
  asOfDate: string | Date;
  positions: OpenForeignPosition[];
  spotRate: (currency: string, asOfDate: string) => number;
}): RevaluationSummary {
  const asOfDate = toIso(params.asOfDate);
  const lines: RevaluationLineCalc[] = params.positions.map((position) => {
    const newRate = params.spotRate(position.currency, asOfDate);
    const newBase = toBaseAmount({
      amount: position.originalAmount,
      currency: position.currency,
      exchangeRate: newRate,
    });
    const delta = roundMoney(newBase - position.carryingBase);
    return { position, newRate, newBase, delta };
  });

  return {
    asOfDate,
    reversalDate: nextDay(asOfDate),
    lines,
    totalDelta: roundMoney(lines.reduce((sum, line) => sum + line.delta, 0)),
    idempotencyKey: `fx_reval_${asOfDate}`,
  };
}

export interface BuildRevaluationJEParams {
  summary: RevaluationSummary;
  fxGainAccountId: string;
  fxLossAccountId: string;
  createdBy: string;
}

export function buildRevaluationJournalEntry(params: BuildRevaluationJEParams) {
  const { summary, fxGainAccountId, fxLossAccountId, createdBy } = params;
  const now = new Date().toISOString();
  const entryId = `JE-FXREV-${summary.asOfDate}`;
  const reversalEntryId = `${entryId}-REV`;

  type Line = {
    account_id: string;
    account_code: string;
    account_name: string;
    debit: number;
    credit: number;
    description: string;
  };

  const lines: Line[] = [];

  summary.lines.forEach((line) => {
    if (Math.abs(line.delta) < 0.005) return;

    const isPositiveDelta = line.delta > 0;
    const isReceivable = line.position.revaluationClass === "receivable";
    const positionAmount = Math.abs(line.delta);
    const debitPosition = isReceivable ? isPositiveDelta : !isPositiveDelta;

    lines.push({
      account_id: line.position.accountId,
      account_code: line.position.accountCode,
      account_name: line.position.accountName,
      debit: debitPosition ? positionAmount : 0,
      credit: debitPosition ? 0 : positionAmount,
      description: `Reval ${line.position.recordType} ${line.position.recordId} @ ${line.newRate}`,
    });

    if (isPositiveDelta) {
      if (isReceivable) {
        lines.push({
          account_id: fxGainAccountId,
          account_code: FX_UNREALIZED_GAIN_CODE,
          account_name: "Unrealized Foreign Exchange Gain",
          debit: 0,
          credit: positionAmount,
          description: `Unrealized FX gain - ${line.position.recordId}`,
        });
      } else {
        lines.push({
          account_id: fxLossAccountId,
          account_code: FX_UNREALIZED_LOSS_CODE,
          account_name: "Unrealized Foreign Exchange Loss",
          debit: positionAmount,
          credit: 0,
          description: `Unrealized FX loss - ${line.position.recordId}`,
        });
      }
      return;
    }

    if (isReceivable) {
      lines.push({
        account_id: fxLossAccountId,
        account_code: FX_UNREALIZED_LOSS_CODE,
        account_name: "Unrealized Foreign Exchange Loss",
        debit: positionAmount,
        credit: 0,
        description: `Unrealized FX loss - ${line.position.recordId}`,
      });
      return;
    }

    lines.push({
      account_id: fxGainAccountId,
      account_code: FX_UNREALIZED_GAIN_CODE,
      account_name: "Unrealized Foreign Exchange Gain",
      debit: 0,
      credit: positionAmount,
      description: `Unrealized FX gain - ${line.position.recordId}`,
    });
  });

  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  const main = {
    id: entryId,
    entry_number: entryId,
    entry_date: `${summary.asOfDate}T23:59:00Z`,
    description: `Period-end FX revaluation @ ${summary.asOfDate}`,
    reference: summary.idempotencyKey,
    lines,
    total_debit: totalDebit,
    total_credit: totalCredit,
    status: "posted",
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };

  const reverseLines = lines.map((line) => ({
    ...line,
    debit: line.credit,
    credit: line.debit,
    description: `Reversal - ${line.description}`,
  }));

  const reverse = {
    id: reversalEntryId,
    entry_number: reversalEntryId,
    entry_date: `${summary.reversalDate}T00:00:01Z`,
    description: `Reversal of FX revaluation ${summary.asOfDate}`,
    reference: `${summary.idempotencyKey}_reversal`,
    lines: reverseLines,
    total_debit: totalCredit,
    total_credit: totalDebit,
    status: "posted",
    created_by: createdBy,
    created_at: now,
    updated_at: now,
  };

  return { main, reverse };
}

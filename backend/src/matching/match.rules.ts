/**
 * matching/match.rules.ts
 *
 * Per-entity tolerance configuration for invoice matching.
 * Default rules apply unless overridden via entity_matching_policies.metadata.
 */

import type { MatchToleranceConfig } from './match.engine.js';

// ── Default tolerance rules per matching method ──────────────────────────

/**
 * Default tolerance rules per matching method.
 * These can be overridden per-entity via entity_matching_policies.metadata.
 */
export const DEFAULT_TOLERANCE: Record<string, MatchToleranceConfig> = {
  two_way: {
    amountTolerancePct: 1.0,
    quantityTolerancePct: 0.0,      // exact qty for 2-way
    unitPriceTolerancePct: 2.0,
    taxTolerancePct: 0.5,
    autoApproveIfWithinTolerance: true,
  },
  three_way: {
    amountTolerancePct: 1.0,
    quantityTolerancePct: 0.5,
    unitPriceTolerancePct: 1.5,
    taxTolerancePct: 0.25,
    autoApproveIfWithinTolerance: true,
  },
  four_way: {
    amountTolerancePct: 0.5,
    quantityTolerancePct: 0.25,
    unitPriceTolerancePct: 1.0,
    taxTolerancePct: 0.1,
    autoApproveIfWithinTolerance: false, // always require human approval for 4-way
  },
};

// ── Exception SLA minutes by severity ───────────────────────────────────

/** Exception SLA minutes by severity */
export const EXCEPTION_SLA: Record<string, number> = {
  critical: 60,
  high:     240,
  medium:   480,
  low:      1440,
};

// ── Blocking fields ───────────────────────────────────────────────────────

/** Fields considered BLOCKING (mismatch = unmatched, not partial) */
export const BLOCKING_FIELDS = new Set([
  'currency',
  'gstin',
  'cgst_rate',
  'sgst_rate',
  'igst_rate',
]);

// ── Exception severity logic ─────────────────────────────────────────────

/**
 * Determine exception severity based on reason code and variance magnitude.
 *
 * Rules:
 *   GSTIN_MISMATCH or DUPLICATE           → critical
 *   MISSING_PO                            → high
 *   variance > 10% of total               → high
 *   variance > 5% of total                → medium
 *   otherwise                             → low
 */
export function getExceptionSeverity(
  reasonCode: string,
  varianceAmount: number,
  totalAmount: number,
): 'critical' | 'high' | 'medium' | 'low' {
  const pct = totalAmount > 0 ? (Math.abs(varianceAmount) / totalAmount) * 100 : 0;

  if (reasonCode === 'GSTIN_MISMATCH' || reasonCode === 'DUPLICATE') return 'critical';
  if (reasonCode === 'MISSING_PO') return 'high';
  if (pct > 10) return 'high';
  if (pct > 5) return 'medium';
  return 'low';
}

// ── Exception display titles ─────────────────────────────────────────────

/** Map variance type to user-friendly title */
export const EXCEPTION_TITLES: Record<string, string> = {
  QTY_VARIANCE:    'Invoice quantity does not match PO or GRN',
  PRICE_VARIANCE:  'Unit price variance exceeds tolerance',
  TAX_VARIANCE:    'Tax amount or rate mismatch detected',
  MISSING_GRN:     'No goods receipt found for invoice',
  MISSING_PO:      'No purchase order linked to invoice',
  DUPLICATE:       'Possible duplicate invoice detected',
  GSTIN_MISMATCH:  'Vendor GSTIN on invoice differs from master',
  AMOUNT_VARIANCE: 'Total amount variance between invoice and PO',
};

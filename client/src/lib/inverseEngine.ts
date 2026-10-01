import { TradeRecord } from './csvParser';

import {
  applyPrivatePatternAdjustment,
  deriveFailureEvidence,
  derivePersonalPatternEvidence,
} from "@shared/personalPatternEvidence";

// ─── Directional (global) patterns ───────────────────────────────────────────

export interface InversePattern {
  type: 'LONG_FAILURE' | 'SHORT_FAILURE' | 'FOMO_ENTRY' | 'PANIC_SELL';
  confidence: number;
  description: string;
  action: 'INVERT_LONG' | 'INVERT_SHORT' | 'WAIT';
}

// ─── Symbol-level patterns ────────────────────────────────────────────────────

/** Bias direction a user shows on a specific trading pair */
export type SymbolBias = 'LONG_BIAS' | 'SHORT_BIAS' | 'NEUTRAL';

/**
 * Per-symbol statistics derived from the user's trade history.
 * Captures win rate, directional bias, average PnL, and a recommended action
 * so the signal engine can boost or suppress confidence on a pair-by-pair basis.
 */
export interface SymbolPattern {
  /** Normalised symbol, e.g. "BTCUSDT" */
  symbol: string;
  /** Total trades on this pair */
  tradeCount: number;
  /** Number of winning trades (pnl > 0) */
  wins: number;
  /** Number of losing trades (pnl < 0) */
  losses: number;
  /** Win rate 0–100 */
  winRate: number;
  /** Average PnL per trade in USDT */
  avgPnl: number;
  /** Total realised PnL on this pair */
  totalPnl: number;
  /** Dominant direction the user trades on this pair */
  dominantSide: 'BUY' | 'SELL' | 'MIXED';
  /** Directional bias derived from win/loss split per side */
  bias: SymbolBias;
  /**
   * Confidence-adjustment delta to apply to AI signals on this pair.
   * Positive = boost (user wins here), negative = suppress (user loses here).
   * Clamped to [-25, +25].
   */
  confidenceAdjustment: number;
  /** Human-readable summary for UI display and LLM injection */
  summary: string;
  /** Recommended action for the signal engine */
  action: 'BOOST' | 'SUPPRESS' | 'NEUTRAL';
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class InverseEngine {
  private trades: TradeRecord[];

  constructor(trades: TradeRecord[]) {
    this.trades = trades;
  }

  // ── Directional (global) pattern analysis ──────────────────────────────────

  /**
   * Analyzes the user's trade history to find recurring directional losing patterns.
   * Returns a list of "Inverse Patterns" that the AI suggests trading AGAINST.
   */
  analyzePatterns(): InversePattern[] {
    const losingTrades = this.trades.filter(t => t.pnl < 0);

    if (losingTrades.length < 5) {
      return []; // Not enough data
    }

    const patterns: InversePattern[] = [];

    // 1. Directional bias (e.g. user loses 80% of Longs)
    const longLosses = losingTrades.filter(t => t.side === 'BUY').length;
    const shortLosses = losingTrades.filter(t => t.side === 'SELL').length;
    const totalLongs = this.trades.filter(t => t.side === 'BUY').length;
    const totalShorts = this.trades.filter(t => t.side === 'SELL').length;

    const longFailureRate = totalLongs > 0 ? longLosses / totalLongs : 0;
    const shortFailureRate = totalShorts > 0 ? shortLosses / totalShorts : 0;

    const longEvidence = deriveFailureEvidence(longLosses, totalLongs);
    const shortEvidence = deriveFailureEvidence(shortLosses, totalShorts);

    if (longEvidence.eligible) {
      patterns.push({
        type: 'LONG_FAILURE',
        confidence: Math.round(longEvidence.posteriorFailureRate * 100),
        description: `Private history indicates a shrinkage-adjusted ${Math.round(longEvidence.posteriorFailureRate * 100)}% Long failure rate across ${totalLongs} completed Longs.`,
        action: 'INVERT_LONG',
      });
    }

    if (shortEvidence.eligible) {
      patterns.push({
        type: 'SHORT_FAILURE',
        confidence: Math.round(shortEvidence.posteriorFailureRate * 100),
        description: `Private history indicates a shrinkage-adjusted ${Math.round(shortEvidence.posteriorFailureRate * 100)}% Short failure rate across ${totalShorts} completed Shorts.`,
        action: 'INVERT_SHORT',
      });
    }

    // 2. Revenge trading (consecutive losses within 1 hour)
    let revengeCount = 0;
    for (let i = 1; i < losingTrades.length; i++) {
      const timeDiff = Math.abs(losingTrades[i].timestamp - losingTrades[i - 1].timestamp);
      if (timeDiff < 3_600_000) revengeCount++;
    }
    if (revengeCount > 3) {
      patterns.push({
        type: 'FOMO_ENTRY',
        confidence: 85,
        description: 'Detected frequent rapid-fire entries after losses (Revenge Trading).',
        action: 'WAIT',
      });
    }

    return patterns;
  }

  // ── Symbol-level pattern analysis ─────────────────────────────────────────

  /**
   * Analyses per-symbol performance from the user's trade history.
   * Only considers symbols with at least `minTrades` trades (default 3).
   *
   * Returns an array of SymbolPattern objects sorted by absolute
   * confidenceAdjustment descending (most impactful pairs first).
   */
  analyzeSymbolPatterns(minTrades = 5): SymbolPattern[] {
    // Group trades by normalised symbol
    const bySymbol = new Map<string, TradeRecord[]>();
    for (const trade of this.trades) {
      const sym = this.normaliseSymbol(trade.symbol);
      if (!bySymbol.has(sym)) bySymbol.set(sym, []);
      bySymbol.get(sym)!.push(trade);
    }

    const results: SymbolPattern[] = [];

    for (const [symbol, trades] of Array.from(bySymbol.entries())) {
      if (trades.length < minTrades) continue;

      const wins = trades.filter((t: TradeRecord) => t.pnl > 0).length;
      const losses = trades.filter((t: TradeRecord) => t.pnl < 0).length;
      const winRate = Math.round((wins / trades.length) * 100);
      const totalPnl = trades.reduce((s: number, t: TradeRecord) => s + t.pnl, 0);
      const avgPnl = totalPnl / trades.length;

      // Dominant side
      const buyCount = trades.filter((t: TradeRecord) => t.side === 'BUY').length;
      const sellCount = trades.filter((t: TradeRecord) => t.side === 'SELL').length;
      const dominantSide: 'BUY' | 'SELL' | 'MIXED' =
        buyCount > sellCount * 1.5 ? 'BUY' :
        sellCount > buyCount * 1.5 ? 'SELL' : 'MIXED';

      // Per-side win rates for directional bias
      const buyTrades = trades.filter((t: TradeRecord) => t.side === 'BUY');
      const sellTrades = trades.filter((t: TradeRecord) => t.side === 'SELL');
      const buyWinRate = buyTrades.length > 0
        ? buyTrades.filter((t: TradeRecord) => t.pnl > 0).length / buyTrades.length
        : 0.5;
      const sellWinRate = sellTrades.length > 0
        ? sellTrades.filter((t: TradeRecord) => t.pnl > 0).length / sellTrades.length
        : 0.5;

      // Bias: if user wins significantly more on one side, flag it
      let bias: SymbolBias = 'NEUTRAL';
      if (buyWinRate > 0.6 && buyWinRate > sellWinRate + 0.2) bias = 'LONG_BIAS';
      else if (sellWinRate > 0.6 && sellWinRate > buyWinRate + 0.2) bias = 'SHORT_BIAS';

      const evidence = derivePersonalPatternEvidence(wins, losses);
      const confidenceAdjustment = evidence.signalAdjustment;
      const action: 'BOOST' | 'SUPPRESS' | 'NEUTRAL' = evidence.action;

      // Human-readable summary
      const summary = this.buildSymbolSummary(
        symbol, winRate, wins, losses, trades.length,
        avgPnl, totalPnl, dominantSide, bias, confidenceAdjustment
      );

      results.push({
        symbol,
        tradeCount: trades.length,
        wins,
        losses,
        winRate,
        avgPnl: Math.round(avgPnl * 100) / 100,
        totalPnl: Math.round(totalPnl * 100) / 100,
        dominantSide,
        bias,
        confidenceAdjustment,
        summary,
        action,
      });
    }

    // Sort by absolute impact descending
    return results.sort(
      (a, b) => Math.abs(b.confidenceAdjustment) - Math.abs(a.confidenceAdjustment)
    );
  }

  /**
   * Returns the SymbolPattern for a specific symbol, or null if not found.
   * Accepts both raw symbols (e.g. "BTC/USDT", "BTCUSDT-PERP") and normalised ones.
   */
  getSymbolPattern(symbol: string, patterns: SymbolPattern[]): SymbolPattern | null {
    const norm = this.normaliseSymbol(symbol);
    return patterns
      .filter(p => p.symbol === norm)
      .sort((a, b) => a.confidenceAdjustment - b.confidenceAdjustment)[0] ?? null;
  }

  // ── Signal adjustment ──────────────────────────────────────────────────────

  /**
   * Adjusts a standard AI signal based on the user's personal Inverse patterns
   * AND symbol-level patterns. Symbol-level adjustments are applied first (more
   * specific), then directional patterns provide an additional layer.
   */
  adjustSignal(
    baseSignal: { type: 'LONG' | 'SHORT'; confidence: number },
    patterns: InversePattern[],
    symbolPatterns?: SymbolPattern[],
    symbol?: string
  ): {
    type: 'LONG' | 'SHORT';
    confidence: number;
    inverseRationale: string;
    symbolRationale: string;
  } {
    let confidence = baseSignal.confidence;
    let inverseRationale = '';
    let symbolRationale = '';

    // 1. Symbol-level adjustment (most specific)
    if (symbolPatterns && symbol) {
      const sp = this.getSymbolPattern(symbol, symbolPatterns);
      if (sp && sp.action !== 'NEUTRAL') {
        confidence = applyPrivatePatternAdjustment(confidence, sp.confidenceAdjustment);
        symbolRationale = `${sp.confidenceAdjustment}pts: Private ${sp.symbol} history shows ${sp.wins} wins and ${sp.losses} losses; behaviour evidence may suppress but never promote an entry.`;
      }
    }

    // 2. Directional (global) pattern adjustment
    const relevantPattern = patterns.find(p =>
      (baseSignal.type === 'LONG' && p.type === 'LONG_FAILURE') ||
      (baseSignal.type === 'SHORT' && p.type === 'SHORT_FAILURE')
    );

    if (relevantPattern) {
      confidence = applyPrivatePatternAdjustment(confidence, -3);
      inverseRationale = `Private risk filter: ${relevantPattern.confidence}% shrinkage-adjusted failure evidence on ${relevantPattern.type === 'LONG_FAILURE' ? 'Longs' : 'Shorts'} reduced confidence; direction was not flipped.`;
    }

    return {
      type: baseSignal.type,
      confidence: Math.min(99, Math.max(1, confidence)),
      inverseRationale,
      symbolRationale,
    };
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Normalises a symbol string to a bare "BTCUSDT" format.
   * Handles: "BTC/USDT", "BTCUSDT-PERP", "BTC:USDT", "btcusdt", "BTCUSDT.P"
   */
  normaliseSymbol(symbol: string): string {
    return symbol
      .toUpperCase()
      .replace(/[/\-.:]/g, '')
      .replace(/PERP$/, '')
      .replace(/\.P$/, '')
      .trim();
  }

  private buildSymbolSummary(
    symbol: string,
    winRate: number,
    wins: number,
    losses: number,
    total: number,
    avgPnl: number,
    totalPnl: number,
    dominantSide: string,
    bias: SymbolBias,
    adj: number
  ): string {
    const pnlStr = totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`;
    const adjStr = adj > 0 ? `+${adj}` : `${adj}`;
    const biasNote = bias !== 'NEUTRAL'
      ? ` Directional bias: ${bias === 'LONG_BIAS' ? 'better at Longs' : 'better at Shorts'}.`
      : '';
    return `${symbol}: ${total} private completed trades, ${winRate}% observed win rate (${wins}W/${losses}L), avg PnL ${avgPnl >= 0 ? '+' : ''}$${avgPnl.toFixed(2)}, total ${pnlStr}. Dominant side: ${dominantSide}.${biasNote} Conservative risk adjustment: ${adjStr}pts; personal history cannot increase executable confidence.`;
  }
}

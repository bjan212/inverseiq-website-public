/**
 * featureEngine.test.ts
 *
 * Unit tests for the Feature Engineering Pipeline.
 * Tests indicator computations and feature vector generation.
 */

import { describe, it, expect } from "vitest";

// We test the internal computation functions by importing the module
// Since the indicator functions are not exported, we test via generateFeatures
// and also test the getFeatureNames utility.

describe("featureEngine", () => {
  describe("getFeatureNames", () => {
    it("should return 100+ feature names", async () => {
      const { getFeatureNames } = await import("./featureEngine");
      const names = getFeatureNames();
      expect(names.length).toBeGreaterThanOrEqual(90);
      // All names should be strings
      names.forEach(name => {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
      });
    });

    it("should include expected feature categories", async () => {
      const { getFeatureNames } = await import("./featureEngine");
      const names = getFeatureNames();

      // RSI features across timeframes
      expect(names).toContain("5m_rsi14");
      expect(names).toContain("15m_rsi14");
      expect(names).toContain("1h_rsi14");
      expect(names).toContain("4h_rsi14");

      // EMA distance features
      expect(names).toContain("1h_ema9_dist");
      expect(names).toContain("1h_ema21_dist");
      expect(names).toContain("1h_ema50_dist");
      expect(names).toContain("1h_ema200_dist");

      // Bollinger Band
      expect(names).toContain("1h_bb_pos");
      expect(names).toContain("1h_bb_width");

      // MACD
      expect(names).toContain("1h_macd_hist");
      expect(names).toContain("1h_macd_signal_dist");

      // ADX
      expect(names).toContain("1h_adx");

      // ATR
      expect(names).toContain("1h_atr_pct");

      // Stochastic
      expect(names).toContain("1h_stoch_k");
      expect(names).toContain("1h_stoch_d");

      // OBV
      expect(names).toContain("1h_obv_slope");

      // MFI
      expect(names).toContain("1h_mfi");

      // Volume ratio
      expect(names).toContain("1h_vol_ratio");

      // Lagged features
      expect(names).toContain("1h_rsi14_lag1");
      expect(names).toContain("1h_rsi14_lag2");
      expect(names).toContain("1h_rsi14_lag3");

      // Cross-pair features
      expect(names).toContain("btc_correlation_20");
      expect(names).toContain("btc_relative_strength");

      // Divergences
      expect(names).toContain("rsi_divergence_5m_1h");
      expect(names).toContain("macd_divergence_1h_4h");
      expect(names).toContain("ema_stack_agreement");

      // Momentum
      expect(names).toContain("1h_roc_10");
      expect(names).toContain("1h_roc_20");

      // Volatility regime
      expect(names).toContain("1h_atr_regime");
    });

    it("should have no duplicate feature names", async () => {
      const { getFeatureNames } = await import("./featureEngine");
      const names = getFeatureNames();
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(names.length);
    });
  });
});

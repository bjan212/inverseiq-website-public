/**
 * Backend Service Layer
 * Connects frontend to the inverse-iq continuous learning AI backend
 */

import axios from "axios";

const BACKEND_URL = import.meta.env.VITE_INVERSEIQ_BACKEND_URL || "http://146.190.233.46:3001";

interface BackendSignal {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  rationale: string;
  riskReward: number;
  timeframe?: string;
  patternType?: string;
}

interface AIStats {
  totalPatterns: number;
  totalTraders: number;
  avgConfidence: number;
  lastUpdated: string;
}

interface DetailedAIStats {
  totalPatterns: number;
  totalTraders: number;
  totalTrades: number;
  lastUpdated: string;
  patternSources: {
    publicOnly: number;
    traderOnly: number;
    combined: number;
  };
  confidenceBySource: {
    publicPatterns: number;
    traderPatterns: number;
    combinedPatterns: number;
  };
  qualityDistribution: {
    highConfidence: number;  // 85%+
    mediumConfidence: number; // 70-84%
    lowConfidence: number;   // <70%
  };
  insights: string[];
}

/**
 * Generate AI signal from backend
 */
export async function generateBackendSignal(symbols: string[]): Promise<BackendSignal | null> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/signals`, {
      params: {
        symbols: symbols.join(","),
      },
      timeout: 15000,
    });

    if (response.data.success && response.data.signal) {
      const signal = response.data.signal;
      
      return {
        symbol: signal.symbol,
        direction: signal.direction,
        entry: signal.entry,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        confidence: signal.confidence,
        rationale: signal.rationale || "AI-generated signal based on continuous learning patterns",
        riskReward: signal.riskReward || ((signal.takeProfit - signal.entry) / (signal.entry - signal.stopLoss)),
        timeframe: signal.timeframe,
        patternType: signal.patternType,
      };
    }

    return null;
  } catch (error: any) {
    console.error("[BackendService] Failed to generate signal:", error.message);
    return null;
  }
}

/**
 * Get AI engine statistics
 */
export async function getAIStats(): Promise<AIStats | null> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/ai/stats`, {
      timeout: 10000,
    });

    if (response.data.success) {
      return {
        totalPatterns: response.data.totalPatterns || 0,
        totalTraders: response.data.totalTraders || 0,
        avgConfidence: response.data.avgConfidence || 0,
        lastUpdated: response.data.lastUpdated || new Date().toISOString(),
      };
    }

    return null;
  } catch (error: any) {
    console.error("[BackendService] Failed to get AI stats:", error.message);
    return null;
  }
}

/**
 * Get detailed AI engine statistics for dashboard
 */
export async function getDetailedAIStats(): Promise<DetailedAIStats | null> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/ai/stats`, {
      timeout: 10000,
    });

    if (response.data.success) {
      const data = response.data;
      
      return {
        totalPatterns: data.totalPatterns || 0,
        totalTraders: data.totalTraders || 0,
        totalTrades: data.totalTrades || 0,
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        patternSources: {
          publicOnly: data.publicOnlyPatterns || 0,
          traderOnly: data.traderOnlyPatterns || 0,
          combined: data.combinedPatterns || 0,
        },
        confidenceBySource: {
          publicPatterns: data.publicPatternsConfidence || 0,
          traderPatterns: data.traderPatternsConfidence || 0,
          combinedPatterns: data.combinedPatternsConfidence || 0,
        },
        qualityDistribution: {
          highConfidence: data.highConfidenceCount || 0,
          mediumConfidence: data.mediumConfidenceCount || 0,
          lowConfidence: data.lowConfidenceCount || 0,
        },
        insights: data.insights || [],
      };
    }

    return null;
  } catch (error: any) {
    console.error("[BackendService] Failed to get detailed AI stats:", error.message);
    return null;
  }
}

/**
 * Submit signal outcome feedback to backend for continuous learning
 */
export async function submitSignalFeedback(feedback: {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  outcome: "win" | "loss";
  confidence: number;
}): Promise<boolean> {
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/feedback/signal-outcome`,
      feedback,
      {
        timeout: 10000,
      }
    );

    return response.data.success === true;
  } catch (error: any) {
    console.error("[BackendService] Failed to submit feedback:", error.message);
    return false;
  }
}

/**
 * Check if backend is available
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/health`, {
      timeout: 5000,
    });

    return response.data.status === "healthy";
  } catch (error) {
    return false;
  }
}

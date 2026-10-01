import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TradeRecord } from '@/lib/csvParser';
import { InversePattern, InverseEngine, SymbolPattern } from '@/lib/inverseEngine';
import { trpc } from '@/lib/trpc';
import { toast } from 'sonner';

interface TradeContextType {
  trades: TradeRecord[];
  patterns: InversePattern[];
  symbolPatterns: SymbolPattern[];
  isPersisted: boolean;
  lastUploadedAt: Date | null;
  setTrades: (trades: TradeRecord[]) => void;
  clearTrades: () => void;
}

const TradeContext = createContext<TradeContextType | undefined>(undefined);

export function TradeProvider({ children }: { children: ReactNode }) {
  const [trades, setTradesState] = useState<TradeRecord[]>([]);
  const [patterns, setPatterns] = useState<InversePattern[]>([]);
  const [symbolPatterns, setSymbolPatterns] = useState<SymbolPattern[]>([]);
  const [isPersisted, setIsPersisted] = useState(false);
  const [lastUploadedAt, setLastUploadedAt] = useState<Date | null>(null);

  // tRPC hooks
  const { data: savedPatterns, isSuccess: loadedFromDb } = trpc.userPatterns.list.useQuery(undefined, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
  const { data: savedSymbolPatterns, isSuccess: symbolsLoadedFromDb } = trpc.userPatterns.listSymbols.useQuery(undefined, {
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
  const savePatternsMutation = trpc.userPatterns.save.useMutation();
  const saveSymbolsMutation = trpc.userPatterns.saveSymbols.useMutation();
  const clearPatternsMutation = trpc.userPatterns.clear.useMutation();

  // Hydrate directional patterns from DB on mount
  useEffect(() => {
    if (!loadedFromDb || !savedPatterns || savedPatterns.length === 0) return;
    const hydrated: InversePattern[] = savedPatterns.map((p) => ({
      type: p.type,
      confidence: p.confidence,
      description: p.description,
      action: p.action,
    }));
    setPatterns(hydrated);
    setIsPersisted(true);
    const latest = savedPatterns.reduce<Date | null>((acc, p) => {
      const d = new Date(p.updatedAt);
      return acc === null || d > acc ? d : acc;
    }, null);
    setLastUploadedAt(latest);
  }, [loadedFromDb, savedPatterns]);

  // Hydrate symbol patterns from DB on mount
  useEffect(() => {
    if (!symbolsLoadedFromDb || !savedSymbolPatterns || savedSymbolPatterns.length === 0) return;
    const hydrated: SymbolPattern[] = savedSymbolPatterns.map((p) => ({
      symbol: p.symbol,
      tradeCount: p.tradeCount,
      wins: p.wins,
      losses: p.losses,
      winRate: p.winRate,
      avgPnl: p.avgPnl,
      totalPnl: p.totalPnl,
      dominantSide: p.dominantSide,
      bias: p.bias,
      confidenceAdjustment: p.confidenceAdjustment,
      action: p.action,
      summary: p.summary,
    }));
    setSymbolPatterns(hydrated);
  }, [symbolsLoadedFromDb, savedSymbolPatterns]);

  const setTrades = (newTrades: TradeRecord[]) => {
    setTradesState(newTrades);

    const engine = new InverseEngine(newTrades);
    const newPatterns = engine.analyzePatterns();
    const newSymbolPatterns = engine.analyzeSymbolPatterns(3);
    setPatterns(newPatterns);
    setSymbolPatterns(newSymbolPatterns);
    setLastUploadedAt(new Date());

    const wins = newTrades.filter((t) => t.pnl > 0).length;
    const losses = newTrades.filter((t) => t.pnl < 0).length;

    // Persist directional patterns
    const directionalPayload = newPatterns.map((p) => ({
      patternType: p.type as 'LONG_FAILURE' | 'SHORT_FAILURE' | 'FOMO_ENTRY' | 'PANIC_SELL',
      confidence: p.confidence,
      description: p.description,
      action: p.action,
      tradeCount: newTrades.length,
      totalWins: wins,
      totalLosses: losses,
    }));

    // Persist symbol patterns (convert float PnL to integer cents)
    const symbolPayload = newSymbolPatterns.map((sp) => ({
      symbol: sp.symbol,
      tradeCount: sp.tradeCount,
      wins: sp.wins,
      losses: sp.losses,
      winRate: sp.winRate,
      avgPnlCents: Math.round(sp.avgPnl * 100),
      totalPnlCents: Math.round(sp.totalPnl * 100),
      dominantSide: sp.dominantSide,
      bias: sp.bias,
      confidenceAdjustment: sp.confidenceAdjustment,
      action: sp.action,
      summary: sp.summary,
    }));

    // Fire both mutations in parallel
    Promise.all([
      savePatternsMutation.mutateAsync({ patterns: directionalPayload }),
      saveSymbolsMutation.mutateAsync({ patterns: symbolPayload }),
    ])
      .then(() => {
        setIsPersisted(true);
        const symbolCount = newSymbolPatterns.length;
        const patternCount = newPatterns.length;
        toast.success(
          `Analysis complete — ${patternCount} directional pattern${patternCount !== 1 ? 's' : ''} and ${symbolCount} pair${symbolCount !== 1 ? 's' : ''} profiled. Auto-loads on next login.`
        );
      })
      .catch(() => {
        toast.warning('Patterns analysed but could not be saved to DB — they will reset on refresh');
      });
  };

  const clearTrades = () => {
    setTradesState([]);
    setPatterns([]);
    setSymbolPatterns([]);
    setIsPersisted(false);
    setLastUploadedAt(null);
    clearPatternsMutation.mutate(undefined, {
      onSuccess: () => toast.info('Trade history and all patterns cleared'),
    });
  };

  return (
    <TradeContext.Provider value={{ trades, patterns, symbolPatterns, isPersisted, lastUploadedAt, setTrades, clearTrades }}>
      {children}
    </TradeContext.Provider>
  );
}

export function useTrades() {
  const context = useContext(TradeContext);
  if (context === undefined) {
    throw new Error('useTrades must be used within a TradeProvider');
  }
  return context;
}

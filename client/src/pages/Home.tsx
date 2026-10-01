import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FeaturesShowcase from "@/components/FeaturesShowcase";
import Footer from "@/components/Footer";
import AiSetupFinder from "@/components/AiSetupFinder";
import MultiExchangeScanner from "@/components/MultiExchangeScanner";
import SignalOfTheDay from "@/components/SignalOfTheDay";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden selection:bg-primary/30 selection:text-primary-foreground">
      <Navbar />
      <main className="flex-grow">
        <Hero />

        {/* ── Signal of the Day ─────────────────────────────────────────── */}
        <section className="py-16 bg-gradient-to-b from-background to-secondary/10 border-b border-border/20">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold mb-3 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                UPDATED DAILY · HIGHEST CONFIDENCE SIGNAL
              </div>
              <h2 className="font-bold text-2xl md:text-3xl text-foreground tracking-tight">
                SIGNAL OF THE <span className="text-primary">DAY</span>
              </h2>
              <p className="text-muted-foreground mt-2 max-w-xl mx-auto text-sm md:text-base">
                The single highest-confidence trade setup identified by the AI engine across all exchanges in the last 24 hours — authenticated and verified.
              </p>
            </div>
            <SignalOfTheDay />
          </div>
        </section>

        <FeaturesShowcase />
        
        {/* AI Best Trade Section */}
        <section className="py-20 bg-secondary/20 border-y border-border/30 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:40px_40px] pointer-events-none"></div>
          <div className="container mx-auto px-4">
            <div className="flex flex-col lg:flex-row items-center gap-12">
              <div className="lg:w-1/2 text-left">
                <div className="inline-block px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold mb-4 font-mono animate-pulse">
                  LIVE MARKET SCANNER ACTIVE
                </div>
                <h3 className="font-bold text-2xl md:text-3xl lg:text-4xl mb-6 leading-tight tracking-tight">
                  FIND THE <span className="text-primary">BEST TRADE</span> TO TAKE RIGHT NOW
                </h3>
                <p className="text-base text-muted-foreground mb-8 leading-relaxed">
                  Our AI engine analyzes thousands of market data points in real-time, combining multiple strategies to identify the single highest-probability setup available.
                </p>
                <ul className="space-y-4 mb-8 text-muted-foreground">
                  <li className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                    <span>Multi-Strategy Confluence Analysis</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                    <span>Real-time Risk/Reward Calculation</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                    <span>Instant Exchange Execution</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                    <span>Binance · Bybit · OKX · Hyperliquid · dYdX · GMX · AsterDEX</span>
                  </li>
                </ul>
              </div>
              
              <div className="lg:w-1/2 w-full max-w-md mx-auto relative z-10">
                <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-purple-600/20 rounded-2xl blur-xl opacity-50 animate-pulse"></div>
                <AiSetupFinder />
              </div>
            </div>
          </div>
        </section>

        {/* Multi-Exchange Deep Scan Section */}
        <section className="py-20 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/[0.015] bg-[size:40px_40px] pointer-events-none"></div>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-950/10 to-transparent pointer-events-none"></div>
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold mb-4 font-mono">
                🌐 CROSS-EXCHANGE INTELLIGENCE
              </div>
              <h3 className="font-bold text-2xl md:text-3xl lg:text-4xl mb-4 tracking-tight">
                DEEP SCAN <span className="text-cyan-400">ALL MARKETS</span>
              </h3>
              <p className="text-base text-muted-foreground max-w-2xl mx-auto">
                Simultaneously scan CEX and DeFi markets for the highest-liquidity, best risk/reward opportunity across every major exchange — then copy-trade directly.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start overflow-x-hidden">
              {/* Stats Column */}
              <div className="space-y-4">
                <div className="bg-card border border-border/40 rounded-xl p-4">
                  <h4 className="text-xs font-bold mb-3 text-cyan-400 uppercase tracking-widest">EXCHANGES COVERED</h4>
                  <div className="space-y-2">
                    {[
                      { name: "Binance Futures", icon: "🟡", type: "CEX" },
                      { name: "Bybit Futures", icon: "🟠", type: "CEX" },
                      { name: "OKX Futures", icon: "🔵", type: "CEX" },
                      { name: "Hyperliquid", icon: "🟣", type: "DeFi" },
                      { name: "dYdX", icon: "🩷", type: "DeFi" },
                      { name: "GMX", icon: "🩵", type: "DeFi" },
                      { name: "AsterDEX", icon: "⭐", type: "DeFi" },
                    ].map((ex) => (
                      <div key={ex.name} className="flex items-center justify-between text-xs">
                        <span className="font-mono text-muted-foreground">{ex.icon} {ex.name}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                          ex.type === 'DeFi'
                            ? 'text-purple-400 border-purple-400/30 bg-purple-400/10'
                            : 'text-blue-400 border-blue-400/30 bg-blue-400/10'
                        }`}>{ex.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-card border border-border/40 rounded-xl p-4">
                  <h4 className="text-xs font-bold mb-3 text-primary uppercase tracking-widest">SCORING CRITERIA</h4>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2"><span className="text-green-400">●</span> Liquidity depth (order book)</div>
                    <div className="flex items-center gap-2"><span className="text-blue-400">●</span> Volume / Open Interest ratio</div>
                    <div className="flex items-center gap-2"><span className="text-orange-400">●</span> Funding rate anomalies</div>
                    <div className="flex items-center gap-2"><span className="text-purple-400">●</span> 24h price momentum</div>
                    <div className="flex items-center gap-2"><span className="text-cyan-400">●</span> DeFi yield opportunities</div>
                  </div>
                </div>
              </div>
              {/* Scanner Column (spans 2) */}
              <div className="lg:col-span-2">
                <MultiExchangeScanner />
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

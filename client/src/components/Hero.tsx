import { Button } from "@/components/ui/button";
import { ArrowRight, Activity, Shield, Zap, Radar, Gem } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background */}
      <div className="absolute inset-0 bg-background z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f2937_1px,transparent_1px),linear-gradient(to_bottom,#1f2937_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/15 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-emerald-500/15 rounded-full blur-[96px] animate-pulse delay-1000" />
      </div>

      <div className="container mx-auto px-4 z-10 relative">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-sm mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-mono text-xs text-cyan-400 tracking-wider">PERPETUAL FUTURES · AI SIGNALS · 1-CLICK EXECUTION</span>
          </div>

          {/* Heading */}
          <h1 className="font-black tracking-tight text-4xl sm:text-5xl md:text-7xl lg:text-8xl leading-tight mb-6 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            TWO TOOLS.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-primary to-emerald-400 drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">
              ONE EDGE.
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-base sm:text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-400">
            A 5-layer AI confluence engine scans every perpetual futures pair across 4 exchanges to surface the single highest-conviction setup right now. Spot gems handled separately.
          </p>

          {/* Two primary tool CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 mb-12 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-600 w-full max-w-lg">
            {/* Tool 1 — Futures Scanner */}
            <a href="/scanner" className="flex-1">
              <div className="group flex flex-col items-center gap-3 px-6 py-5 rounded-2xl border border-cyan-500/40 bg-cyan-500/8 hover:bg-cyan-500/15 hover:border-cyan-500/60 transition-all duration-300 cursor-pointer shadow-[0_0_20px_rgba(0,240,255,0.08)] hover:shadow-[0_0_30px_rgba(0,240,255,0.18)]">
                <div className="flex items-center gap-2">
                  <Radar className="w-5 h-5 text-cyan-400" />
                  <span className="font-bold text-base text-cyan-300 tracking-wide">Live Scanner</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 tracking-widest">FUTURES</span>
                </div>
                <p className="text-xs text-white/40 text-center leading-relaxed">
                  Best trade to enter right now — AUTO scan or deep-dive any coin
                </p>
                <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs h-8 px-4 w-full group-hover:shadow-[0_0_12px_rgba(0,240,255,0.4)] transition-all">
                  FIND BEST TRADE NOW <ArrowRight className="ml-1 w-3 h-3" />
                </Button>
              </div>
            </a>

            {/* Tool 2 — Gem Finder */}
            <a href="/gem-finder" className="flex-1">
              <div className="group flex flex-col items-center gap-3 px-6 py-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/8 hover:bg-emerald-500/15 hover:border-emerald-500/60 transition-all duration-300 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.08)] hover:shadow-[0_0_30px_rgba(16,185,129,0.18)]">
                <div className="flex items-center gap-2">
                  <Gem className="w-5 h-5 text-emerald-400" />
                  <span className="font-bold text-base text-emerald-300 tracking-wide">Gem Finder</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 tracking-widest">SPOT</span>
                </div>
                <p className="text-xs text-white/40 text-center leading-relaxed">
                  Spot market gems — dips ready to explode &amp; upcoming projects
                </p>
                <Button size="sm" variant="outline" className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs h-8 px-4 w-full transition-all">
                  FIND SPOT GEMS <ArrowRight className="ml-1 w-3 h-3" />
                </Button>
              </div>
            </a>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-3 gap-4 sm:gap-8 w-full border-t border-border/30 pt-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-800">
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 rounded-full bg-background border border-border/50 shadow-inner">
                <Activity className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
              </div>
              <h3 className="font-bold tracking-tight text-sm sm:text-lg">4 EXCHANGES</h3>
              <p className="text-muted-foreground text-xs sm:text-sm text-center">Binance · Bybit · OKX · HL</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 rounded-full bg-background border border-border/50 shadow-inner">
                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400" />
              </div>
              <h3 className="font-bold tracking-tight text-sm sm:text-lg">5-LAYER AI</h3>
              <p className="text-muted-foreground text-xs sm:text-sm text-center">Confluence engine</p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 rounded-full bg-background border border-border/50 shadow-inner">
                <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-green-400" />
              </div>
              <h3 className="font-bold tracking-tight text-sm sm:text-lg">1-CLICK</h3>
              <p className="text-muted-foreground text-xs sm:text-sm text-center">Kelly-sized execution</p>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-background to-transparent z-20 pointer-events-none" />
    </section>
  );
}

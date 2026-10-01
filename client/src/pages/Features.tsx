import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Brain,
  GitBranch,
  Terminal,
  ShieldCheck,
  Zap,
  BarChart3,
  ArrowRight,
  Bell,
  Globe,
  TrendingUp,
  Lock,
  RefreshCw,
  Target,
  Gem,
  Activity,
  Cpu,
  Eye,
  Clock,
  CheckCircle2,
  Layers,
  Wallet,
  LineChart,
  Radio,
  Database,
} from "lucide-react";

const EXCHANGES = [
  { name: "Binance", color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30", icon: "🟡" },
  { name: "Bybit", color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/30", icon: "🟠" },
  { name: "OKX", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30", icon: "🔵" },
  { name: "Hyperliquid", color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/30", icon: "🟣" },
  { name: "dYdX", color: "text-pink-400", bg: "bg-pink-400/10 border-pink-400/30", icon: "🩷" },
  { name: "GMX", color: "text-cyan-400", bg: "bg-cyan-400/10 border-cyan-400/30", icon: "🩵" },
];

const STRATEGIES = [
  { name: "Inverse IQ", badge: "FLAGSHIP", color: "text-primary", desc: "Learns from your losing trades and inverts the pattern into high-confidence entries." },
  { name: "Momentum RSI", badge: "ALWAYS ON", color: "text-green-400", desc: "RSI + MACD + EMA confluence — guaranteed signal every scan, no dead zones." },
  { name: "Supertrend", badge: "TREND", color: "text-yellow-400", desc: "ATR-based trend bands that adapt to volatility for clean trend-following entries." },
  { name: "AI Best Pick", badge: "COMPOSITE", color: "text-purple-400", desc: "Runs all strategies in parallel and selects the single highest-scoring setup." },
];

const FEATURE_GRID = [
  {
    icon: <Bell className="w-6 h-6 text-primary" />,
    title: "Real-Time Notifications",
    desc: "Browser push, email, and SMS alerts the moment a signal hits TP or SL. Customisable per notification type.",
    badge: "LIVE",
  },
  {
    icon: <Clock className="w-6 h-6 text-yellow-400" />,
    title: "Signal Countdown Timers",
    desc: "Every signal shows a live validity countdown with colour-coded urgency (green → yellow → red). Expired signals auto-grey.",
    badge: "LIVE",
  },
  {
    icon: <CheckCircle2 className="w-6 h-6 text-green-400" />,
    title: "Automated Verification",
    desc: "Background service checks Binance price data every 5 minutes to verify if TP or SL was hit — no manual tracking.",
    badge: "AUTO",
  },
  {
    icon: <Database className="w-6 h-6 text-blue-400" />,
    title: "Confidence History",
    desc: "30-day rolling database of win rates, signal counts, and AI confidence scores with interactive Recharts visualisations.",
    badge: "TRACKED",
  },
  {
    icon: <Lock className="w-6 h-6 text-orange-400" />,
    title: "Encrypted API Keys",
    desc: "Binance Futures API keys stored with AES-256-CBC encryption. One-click order execution directly from signal cards.",
    badge: "SECURE",
  },
  {
    icon: <Gem className="w-6 h-6 text-pink-400" />,
    title: "Gem Finder",
    desc: "Low-cap multi-exchange screener with risk-appetite filters (Very High → Low), watchlist persistence, and breakout alerts.",
    badge: "NEW",
  },
  {
    icon: <LineChart className="w-6 h-6 text-purple-400" />,
    title: "AI Statistics Dashboard",
    desc: "Track pattern counts, trader contributions, quality distribution, and confidence trends from the continuous learning engine.",
    badge: "LIVE",
  },
  {
    icon: <Radio className="w-6 h-6 text-cyan-400" />,
    title: "WebSocket Updates",
    desc: "Real-time signal updates and notification broadcasts via Socket.IO — no page refresh needed.",
    badge: "LIVE",
  },
  {
    icon: <Terminal className="w-6 h-6 text-green-400" />,
    title: "Trade History Upload",
    desc: "Upload your CSV trade history to personalise the Inverse IQ engine with your own failure patterns.",
    badge: "PERSONAL",
  },
  {
    icon: <Activity className="w-6 h-6 text-red-400" />,
    title: "30-Day Backtesting",
    desc: "Run a historical backtest on any signal against real Binance Futures data to validate strategy performance.",
    badge: "DATA",
  },
  {
    icon: <Wallet className="w-6 h-6 text-yellow-400" />,
    title: "Web3 Wallet Connect",
    desc: "Connect MetaMask or any WalletConnect wallet for direct DEX execution on Hyperliquid and other DeFi perp protocols.",
    badge: "WEB3",
  },
  {
    icon: <Eye className="w-6 h-6 text-blue-400" />,
    title: "Transparent Performance",
    desc: "Public verification page showing every signal ≥80% confidence, its outcome, exit price, and win rate — nothing hidden.",
    badge: "PUBLIC",
  },
];

export default function Features() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main className="flex-grow pt-20">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(0,240,255,0.12),transparent_65%)]" />
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:40px_40px]" />
          <div className="container mx-auto px-4 relative z-10 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 mb-6">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span className="font-mono text-xs text-primary tracking-widest">FULL PLATFORM OVERVIEW</span>
            </div>
            <h1 className="font-black tracking-tight text-4xl md:text-6xl mb-6 leading-tight">
              EVERY TOOL YOU NEED TO<br />
              <span className="text-primary">TRADE SMARTER</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              InverseIQ is not just a signal tool. It is a complete AI-powered trading intelligence platform
              covering 6 exchanges, 4 strategies, real-time verification, and continuous machine learning.
            </p>
          </div>
        </section>

        {/* ── Feature 1: Inverse Learning ───────────────────────────────────── */}
        <section className="py-20 border-y border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center gap-16">
              <div className="w-full md:w-1/2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 mb-6">
                  <Brain className="w-4 h-4 text-primary" />
                  <span className="font-mono text-xs text-primary tracking-wider">CORE TECHNOLOGY</span>
                </div>
                <h2 className="font-bold tracking-tight text-3xl md:text-4xl mb-6">
                  INVERSE LEARNING STRATEGY
                </h2>
                <p className="text-base md:text-lg text-muted-foreground mb-6 leading-relaxed">
                  While others chase winning patterns, InverseIQ learns from losses — often the more reliable signal.
                  The engine analyses your complete futures trade history to identify the exact entry conditions of your
                  losing trades and inverts the signal into a high-probability entry.
                </p>
                <div className="space-y-3 mb-8">
                  {[
                    "Detects false breakouts, exhaustion tops, and liquidation wicks",
                    "Inverts losing trade conditions into high-confidence signals",
                    "Personalises to your own trading failure patterns via CSV upload",
                    "Continuously improves via the continuous learning AI backend",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 text-base">
                      <div className="w-1.5 h-1.5 mt-2 bg-primary rounded-full shadow-[0_0_8px_rgba(0,240,255,0.8)] flex-shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
                <Link href="/">
                  <Button className="font-bold tracking-tight bg-primary text-black font-bold hover:bg-primary/90">
                    TRY IT NOW <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
              <div className="w-full md:w-1/2">
                <div className="rounded-2xl bg-card border border-border/50 p-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-purple-600/5" />
                  {/* Animated brain + rings */}
                  <div className="flex items-center justify-center py-8 relative">
                    <div className="relative w-48 h-48">
                      <div className="absolute inset-0 border-2 border-primary/20 rounded-full animate-[spin_12s_linear_infinite]" />
                      <div className="absolute inset-6 border-2 border-purple-500/20 rounded-full animate-[spin_18s_linear_infinite_reverse]" />
                      <div className="absolute inset-12 border-2 border-primary/30 rounded-full animate-[spin_8s_linear_infinite]" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Brain className="w-16 h-16 text-primary animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="bg-black/40 border border-green-500/30 rounded-lg p-3">
                      <div className="font-mono text-xs text-muted-foreground mb-1">PATTERN DETECTED</div>
                      <div className="font-mono text-xs text-red-400 font-bold">BULL TRAP @ RESISTANCE</div>
                    </div>
                    <div className="bg-black/40 border border-primary/30 rounded-lg p-3">
                      <div className="font-mono text-xs text-muted-foreground mb-1">INVERSE ACTION</div>
                      <div className="font-mono text-xs text-green-400 font-bold">SHORT ENTRY TRIGGERED</div>
                    </div>
                    <div className="bg-black/40 border border-border/30 rounded-lg p-3">
                      <div className="font-mono text-xs text-muted-foreground mb-1">CONFIDENCE</div>
                      <div className="font-mono text-xs text-primary font-bold">87%</div>
                    </div>
                    <div className="bg-black/40 border border-border/30 rounded-lg p-3">
                      <div className="font-mono text-xs text-muted-foreground mb-1">RISK / REWARD</div>
                      <div className="font-mono text-xs text-yellow-400 font-bold">1 : 2.8</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feature 2: Multi-Exchange Scanner ─────────────────────────────── */}
        <section className="py-20 bg-secondary/5">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row-reverse items-center gap-16">
              <div className="w-full md:w-1/2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 mb-6">
                  <Globe className="w-4 h-4 text-blue-400" />
                  <span className="font-mono text-xs text-blue-400 tracking-wider">MULTI-EXCHANGE</span>
                </div>
                <h2 className="font-bold tracking-tight text-3xl md:text-4xl mb-6">
                  DEEP MARKET SCANNER
                </h2>
                <p className="text-base md:text-lg text-muted-foreground mb-6 leading-relaxed">
                  The Deep Market Scanner aggregates live data from all 6 supported exchanges simultaneously.
                  Unlike the AI Setup Finder which requires specific pattern conditions, the scanner uses a
                  composite scoring algorithm on raw market data — so it <em>always</em> surfaces the best
                  available opportunity, even in quiet markets.
                </p>
                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { label: "Liquidity Score", desc: "Order book depth ranking" },
                    { label: "Funding Rate", desc: "Extreme rates = mean reversion" },
                    { label: "OI / Volume Ratio", desc: "Leverage concentration signal" },
                    { label: "Price Momentum", desc: "24h change trend direction" },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-card border border-border/50 rounded-lg">
                      <div className="font-bold text-xs text-blue-400 mb-1">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{item.desc}</div>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {EXCHANGES.map((ex) => (
                    <span key={ex.name} className={`px-3 py-1 rounded-full border text-xs font-mono font-bold ${ex.bg} ${ex.color}`}>
                      {ex.icon} {ex.name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-1/2">
                <div className="rounded-2xl bg-card border border-border/50 p-6 space-y-3">
                  {[
                    { exchange: "🟡 Binance", symbol: "BTC/USDT", dir: "LONG", conf: 84, score: 91, color: "text-yellow-400" },
                    { exchange: "🟣 Hyperliquid", symbol: "ETH/USDT", dir: "SHORT", conf: 79, score: 87, color: "text-purple-400" },
                    { exchange: "🔵 OKX", symbol: "SOL/USDT", dir: "LONG", conf: 76, score: 82, color: "text-blue-400" },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center justify-between bg-background/60 border border-border/40 rounded-lg px-4 py-3">
                      <div>
                        <div className={`font-mono text-xs font-bold ${row.color}`}>{row.exchange}</div>
                        <div className="font-bold text-sm font-bold mt-0.5">{row.symbol}</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-mono text-xs font-bold ${row.dir === "LONG" ? "text-green-400" : "text-red-400"}`}>{row.dir}</div>
                        <div className="font-mono text-xs text-muted-foreground">{row.conf}% conf</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs text-muted-foreground">Score</div>
                        <div className="font-bold text-sm font-bold text-primary">{row.score}</div>
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-2">
                    <span className="font-mono text-xs text-muted-foreground">+ 17 more signals across all exchanges</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feature 3: 4 Strategies ───────────────────────────────────────── */}
        <section className="py-20 border-y border-border/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-14">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-purple-500/30 bg-purple-500/10 mb-4">
                <Layers className="w-4 h-4 text-purple-400" />
                <span className="font-mono text-xs text-purple-400 tracking-wider">STRATEGY ENGINE</span>
              </div>
              <h2 className="font-bold tracking-tight text-3xl md:text-4xl mb-4">4 BUILT-IN STRATEGIES</h2>
              <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
                Switch between strategies or let the AI Best Pick composite engine select the highest-scoring setup automatically.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {STRATEGIES.map((s, i) => (
                <div key={i} className="p-6 bg-card border border-border/50 rounded-xl hover:border-primary/40 transition-colors group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary/60 to-transparent" />
                  <div className="flex items-start justify-between mb-3">
                    <h3 className={`font-bold tracking-tight text-lg ${s.color}`}>{s.name}</h3>
                    <span className={`px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${s.color} border-current bg-current/10`}>
                      {s.badge}
                    </span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Feature 4: Continuous Learning AI ────────────────────────────── */}
        <section className="py-20 bg-secondary/5">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center gap-16">
              <div className="w-full md:w-1/2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 mb-6">
                  <RefreshCw className="w-4 h-4 text-green-400" />
                  <span className="font-mono text-xs text-green-400 tracking-wider">CONTINUOUS LEARNING</span>
                </div>
                <h2 className="font-bold tracking-tight text-3xl md:text-4xl mb-6">
                  AI THAT GETS SMARTER EVERY DAY
                </h2>
                <p className="text-base md:text-lg text-muted-foreground mb-6 leading-relaxed">
                  Every verified signal outcome is automatically fed back to the AI backend running on a dedicated
                  DigitalOcean server. The engine accumulates patterns from public market data and trader history,
                  continuously improving its confidence calibration.
                </p>
                <div className="space-y-4 mb-8">
                  {[
                    { icon: <Target className="w-4 h-4 text-green-400" />, text: "Signal outcomes verified every 5 minutes via Binance price data" },
                    { icon: <Database className="w-4 h-4 text-blue-400" />, text: "Confidence history tracked hourly with 30-day rolling charts" },
                    { icon: <TrendingUp className="w-4 h-4 text-primary" />, text: "Win rate trend visible on the AI Stats dashboard" },
                    { icon: <Cpu className="w-4 h-4 text-purple-400" />, text: "Backend AI engine at 146.190.233.46:3001 (inverse-iq repo)" },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-0.5 flex-shrink-0">{item.icon}</div>
                      <span className="text-muted-foreground">{item.text}</span>
                    </div>
                  ))}
                </div>
                <Link href="/ai-stats">
                  <Button variant="outline" className="font-bold tracking-tight border-green-500/50 text-green-400 hover:bg-green-500/10">
                    VIEW AI STATS <BarChart3 className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
              <div className="w-full md:w-1/2">
                <div className="rounded-2xl bg-card border border-border/50 p-6">
                  <div className="font-bold text-sm font-bold text-green-400 mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 animate-pulse" />
                    LIVE LEARNING METRICS
                  </div>
                  <div className="space-y-4">
                    {[
                      { label: "30-Day Win Rate", value: "78%", bar: 78, color: "bg-green-500" },
                      { label: "Avg Confidence", value: "83%", bar: 83, color: "bg-primary" },
                      { label: "Signals Verified", value: "340+", bar: 68, color: "bg-blue-500" },
                      { label: "Patterns Learned", value: "1,200+", bar: 60, color: "bg-purple-500" },
                    ].map((metric, i) => (
                      <div key={i}>
                        <div className="flex justify-between mb-1">
                          <span className="text-sm text-muted-foreground">{metric.label}</span>
                          <span className="font-mono text-sm font-bold text-foreground">{metric.value}</span>
                        </div>
                        <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
                          <div className={`h-full ${metric.color} rounded-full`} style={{ width: `${metric.bar}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feature 5: Copy Trading & Execution ──────────────────────────── */}
        <section className="py-20 border-y border-border/30">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row-reverse items-center gap-16">
              <div className="w-full md:w-1/2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-orange-500/30 bg-orange-500/10 mb-6">
                  <Zap className="w-4 h-4 text-orange-400" />
                  <span className="font-mono text-xs text-orange-400 tracking-wider">ONE-CLICK EXECUTION</span>
                </div>
                <h2 className="font-bold tracking-tight text-3xl md:text-4xl mb-6">
                  COPY TRADE IN ONE CLICK
                </h2>
                <p className="text-base md:text-lg text-muted-foreground mb-6 leading-relaxed">
                  Connect your Binance Futures API key (AES-256 encrypted at rest) and execute trades directly
                  from any signal card — no need to switch tabs. For DeFi traders, connect your Web3 wallet for
                  direct Hyperliquid execution.
                </p>
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="p-4 bg-card border border-yellow-400/30 rounded-xl">
                    <div className="font-bold text-xs text-yellow-400 mb-2">CEX EXECUTION</div>
                    <div className="text-sm text-muted-foreground">Binance Futures via encrypted API key. Live position tracking included.</div>
                  </div>
                  <div className="p-4 bg-card border border-purple-400/30 rounded-xl">
                    <div className="font-bold text-xs text-purple-400 mb-2">DEFI EXECUTION</div>
                    <div className="text-sm text-muted-foreground">Hyperliquid, dYdX, GMX via WalletConnect. No custody, full control.</div>
                  </div>
                </div>
                <Link href="/binance-api">
                  <Button variant="outline" className="font-bold tracking-tight border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
                    SETUP BINANCE API <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
              <div className="w-full md:w-1/2">
                <div className="rounded-2xl bg-card border border-border/50 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm font-bold">SIGNAL CARD</span>
                    <span className="font-mono text-xs text-green-400 border border-green-400/30 bg-green-400/10 px-2 py-0.5 rounded">LIVE</span>
                  </div>
                  <div className="bg-background/60 border border-primary/30 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold tracking-tight text-lg">BTC/USDT</div>
                        <div className="font-mono text-xs text-green-400">▲ LONG • 87% confidence</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs text-muted-foreground">Expires in</div>
                        <div className="font-mono text-sm font-bold text-yellow-400">18:42:07</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-1 mb-4 text-center">
                      <div className="bg-card rounded p-2">
                        <div className="font-mono text-xs text-muted-foreground">Entry</div>
                        <div className="font-mono text-sm font-bold">67,420</div>
                      </div>
                      <div className="bg-card rounded p-2">
                        <div className="font-mono text-xs text-green-400">Target</div>
                        <div className="font-mono text-sm font-bold text-green-400">69,850</div>
                      </div>
                      <div className="bg-card rounded p-2">
                        <div className="font-mono text-xs text-red-400">Stop</div>
                        <div className="font-mono text-sm font-bold text-red-400">66,100</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 font-bold text-xs bg-yellow-400/20 text-yellow-400 border border-yellow-400/40 hover:bg-yellow-400/30">
                        🟡 BINANCE
                      </Button>
                      <Button size="sm" className="flex-1 font-bold text-xs bg-purple-400/20 text-purple-400 border border-purple-400/40 hover:bg-purple-400/30">
                        🟣 HYPERLIQUID
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Feature 6: Gem Finder ─────────────────────────────────────────── */}
        <section className="py-20 bg-secondary/5">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center gap-16">
              <div className="w-full md:w-1/2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-pink-500/30 bg-pink-500/10 mb-6">
                  <Gem className="w-4 h-4 text-pink-400" />
                  <span className="font-mono text-xs text-pink-400 tracking-wider">GEM FINDER</span>
                </div>
                <h2 className="font-bold tracking-tight text-3xl md:text-4xl mb-6">
                  FIND LOW-CAP BREAKOUTS FIRST
                </h2>
                <p className="text-base md:text-lg text-muted-foreground mb-6 leading-relaxed">
                  The Gem Finder scans low-cap coins across all 6 exchanges for early breakout signals.
                  Filter by risk appetite, add coins to your watchlist, and receive instant browser alerts
                  when a watched gem breaks out.
                </p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {["Very High Risk", "High Risk", "Medium Risk", "Low Risk"].map((r, i) => (
                    <span key={i} className={`px-3 py-1 rounded-full border font-mono text-xs font-bold ${
                      i === 0 ? "text-red-400 border-red-400/30 bg-red-400/10" :
                      i === 1 ? "text-orange-400 border-orange-400/30 bg-orange-400/10" :
                      i === 2 ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10" :
                      "text-green-400 border-green-400/30 bg-green-400/10"
                    }`}>{r}</span>
                  ))}
                </div>
                <Link href="/gem-finder">
                  <Button variant="outline" className="font-bold tracking-tight border-pink-500/50 text-pink-400 hover:bg-pink-500/10">
                    OPEN GEM FINDER <Gem className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
              <div className="w-full md:w-1/2">
                <div className="rounded-2xl bg-card border border-border/50 p-6 space-y-3">
                  {[
                    { symbol: "PEPE/USDT", exchange: "Binance", score: 94, change: "+18.4%", risk: "Very High", color: "text-red-400" },
                    { symbol: "WIF/USDT", exchange: "Bybit", score: 87, change: "+12.1%", risk: "High", color: "text-orange-400" },
                    { symbol: "BONK/USDT", exchange: "OKX", score: 81, change: "+9.7%", risk: "High", color: "text-orange-400" },
                  ].map((gem, i) => (
                    <div key={i} className="flex items-center justify-between bg-background/60 border border-border/40 rounded-lg px-4 py-3">
                      <div>
                        <div className="font-bold text-sm font-bold">{gem.symbol}</div>
                        <div className="font-mono text-xs text-muted-foreground">{gem.exchange}</div>
                      </div>
                      <div className="text-center">
                        <div className="font-mono text-xs text-green-400 font-bold">{gem.change}</div>
                        <div className={`font-mono text-xs ${gem.color}`}>{gem.risk}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs text-muted-foreground">Gem Score</div>
                        <div className="font-bold text-sm font-bold text-pink-400">{gem.score}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Complete Feature Grid ─────────────────────────────────────────── */}
        <section className="py-20 border-t border-border/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-14">
              <h2 className="font-bold tracking-tight text-3xl md:text-4xl mb-4">COMPLETE TRADING ARSENAL</h2>
              <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
                Every feature built to give you an edge — from signal generation to verified outcomes.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURE_GRID.map((item, i) => (
                <div key={i} className="p-5 bg-card border border-border/50 rounded-xl hover:border-primary/40 transition-all group relative overflow-hidden">
                  <div className="absolute top-3 right-3">
                    <span className="font-mono text-[9px] font-bold text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded">
                      {item.badge}
                    </span>
                  </div>
                  <div className="mb-3 p-2.5 w-fit rounded-lg bg-background border border-border/50 group-hover:scale-110 transition-transform">
                    {item.icon}
                  </div>
                  <h3 className="font-bold tracking-tight text-base mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Transparency Section ──────────────────────────────────────────── */}
        <section className="py-20 bg-secondary/5 border-y border-border/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-green-500/30 bg-green-500/10 mb-4">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <span className="font-mono text-xs text-green-400 tracking-wider">RADICAL TRANSPARENCY</span>
              </div>
              <h2 className="font-bold tracking-tight text-3xl md:text-4xl mb-4">NOTHING HIDDEN. EVERYTHING VERIFIED.</h2>
              <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
                Every signal with ≥80% confidence is publicly logged with its entry, target, stop loss, and verified outcome.
                No cherry-picking. No hidden losses.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto">
              {[
                { value: "80%+", label: "Min Confidence Threshold" },
                { value: "5 min", label: "Verification Interval" },
                { value: "24h", label: "Signal Validity Window" },
                { value: "100%", label: "Public Audit Trail" },
              ].map((stat, i) => (
                <div key={i} className="text-center p-5 bg-card border border-border/50 rounded-xl">
                  <div className="font-black tracking-tight text-2xl text-primary mb-1">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link href="/verification">
                <Button variant="outline" className="font-bold tracking-tight border-green-500/50 text-green-400 hover:bg-green-500/10">
                  VIEW VERIFICATION PAGE <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── CTA ───────────────────────────────────────────────────────────── */}
        <section className="py-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(0,240,255,0.1),transparent_65%)]" />
          <div className="container mx-auto px-4 text-center relative z-10">
            <h2 className="font-black tracking-tight text-3xl md:text-5xl mb-6">
              READY TO TRADE WITH AN EDGE?
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-xl mx-auto">
              Start scanning markets, generating signals, and verifying outcomes — all in one platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/">
                <Button className="h-14 px-10 text-lg font-bold tracking-tight bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_rgba(0,240,255,0.4)]">
                  START SCANNING <Zap className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <Link href="/verification">
                <Button variant="outline" className="h-14 px-10 text-lg font-bold tracking-tight border-primary/50 text-primary hover:bg-primary/10">
                  VIEW TRACK RECORD <CheckCircle2 className="ml-2 w-5 h-5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>

      </main>
      <Footer />
    </div>
  );
}

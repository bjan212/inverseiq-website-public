import { Button } from "@/components/ui/button";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Menu, X, BarChart2, Zap, Gem, Settings, TrendingUp, Star,
  BookOpen, DollarSign, Activity, ChevronRight, Brain, Target,
  PieChart, Search, Layers, FlaskConical, Radar,
} from "lucide-react";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSignals } from "@/contexts/SignalContext";
import WalletConnect from "./WalletConnect";
import NotificationCenter from "./NotificationCenter";

// ─── Navigation structure ─────────────────────────────────────────────────────
// Two primary tool sets + supporting pages
const navGroups = [
  {
    label: "🎯 Tool Set 1 — Live Scanner",
    badge: "FUTURES",
    links: [
      { name: "Live Scanner",    href: "/scanner",        icon: Radar,        description: "Best trade to enter right now — AUTO + MANUAL", highlight: true },
      { name: "Dashboard",       href: "/platform",       icon: Layers,       description: "Live signals + positions overview" },
      { name: "Trade Analyzer",  href: "/trade-analyzer", icon: TrendingUp,   description: "AI analysis of your open positions" },
      { name: "Predictor",       href: "/predict",        icon: Brain,        description: "Futures direction predictor — AI verdict" },
      { name: "My Pairs",        href: "/my-pairs",       icon: PieChart,     description: "Per-symbol win rate breakdown" },
      { name: "Active Trades",   href: "/active-trades",  icon: Activity,     description: "Monitor open positions across exchanges" },
    ],
  },
  {
    label: "💎 Tool Set 2 — Gem Finder",
    badge: "SPOT",
    links: [
      { name: "Gem Finder",      href: "/gem-finder",     icon: Gem,          description: "Spot market gems & dip opportunities", highlight: true },
    ],
  },
  {
    label: "📊 Analytics",
    links: [
      { name: "AI Stats",        href: "/ai-stats",       icon: BarChart2,    description: "Engine confidence & learning metrics" },
      { name: "Verification",    href: "/verification",   icon: Star,         description: "Signal outcome history" },
      { name: "Stats",           href: "/stats",          icon: Activity,     description: "Platform-wide statistics" },
    ],
  },
  {
    label: "⚙️ Account",
    links: [
      { name: "User Settings",   href: "/settings",          icon: Settings,     description: "Default preferences & alert config" },
      { name: "Exchange Setup",  href: "/binance-setup",  icon: Settings,     description: "API keys for 1-click execution" },
      { name: "Telegram Alerts", href: "/settings/telegram", icon: Zap,        description: "Telegram notification settings" },
      { name: "Features",        href: "/features",       icon: FlaskConical, description: "Full feature overview" },
      { name: "Docs",            href: "/docs",           icon: BookOpen,     description: "API & integration docs" },
      { name: "Pricing",         href: "/pricing",        icon: DollarSign,   description: "Plans & pricing" },
    ],
  },
];

// Desktop: two primary tool CTAs, then supporting pages
const desktopLinks = [
  { name: "Dashboard",      href: "/platform",       badge: false, dividerBefore: false },
  { name: "Live Scanner",   href: "/scanner",        badge: true,  dividerBefore: false },
  { name: "Trade Analyzer", href: "/trade-analyzer", badge: false, dividerBefore: false },
  { name: "Predictor",      href: "/predict",        badge: false, dividerBefore: false },
  { name: "My Pairs",       href: "/my-pairs",       badge: false, dividerBefore: false },
  { name: "Active Trades",  href: "/active-trades",  badge: false, dividerBefore: false },
  { name: "Gem Finder",     href: "/gem-finder",     badge: false, dividerBefore: true  },
  { name: "AI Stats",       href: "/ai-stats",       badge: false, dividerBefore: true  },
  { name: "Exchange Setup", href: "/binance-setup",  badge: false, dividerBefore: false },
  { name: "Settings",       href: "/settings",        badge: false, dividerBefore: false },
];

export default function Navbar() {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [menuAnimating, setMenuAnimating] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    if (isMobileMenuOpen) {
      setMenuVisible(true);
      // Small delay to allow DOM paint before triggering CSS transition
      const raf = setTimeout(() => setMenuAnimating(true), 20);
      return () => clearTimeout(raf);
    } else {
      setMenuAnimating(false);
      const timeout = setTimeout(() => setMenuVisible(false), 300);
      return () => clearTimeout(timeout);
    }
  }, [isMobileMenuOpen]);
  const { hasNewSignals } = useSignals();

  // Auto-close mobile menu on route change (safety net for all links)
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const closeMobile = () => setIsMobileMenuOpen(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[70] bg-[#080a0c]/95 backdrop-blur-md border-b border-white/8">
      <div className="max-w-screen-2xl mx-auto px-4 h-16 flex items-center justify-between gap-4">

        {/* ── Logo ── */}
        <Link href="/" onClick={closeMobile}>
          <div className="flex items-center gap-2 cursor-pointer shrink-0">
            <div className="w-7 h-7 bg-cyan-500 rounded flex items-center justify-center">
              <span className="text-black font-bold text-sm font-mono">X</span>
            </div>
            <span className="font-bold text-base tracking-wide text-white">
              XRYPT<span className="text-cyan-400">.NET</span>
            </span>
            <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 uppercase">
              FUTURES
            </span>
          </div>
        </Link>

        {/* ── Desktop Navigation ── */}
        <div className="hidden md:flex items-center gap-0.5 flex-1 justify-center">
          {desktopLinks.map((link) => {
            const isActive = location === link.href;
            const isScanner = link.href === "/scanner";
            const isGem = link.href === "/gem-finder";
            // Secondary links only visible on lg+
            const isSecondary = ["My Pairs", "AI Stats"].includes(link.name);
            return (
              <div key={link.name} className={cn("flex items-center", isSecondary && "hidden lg:flex")}>
                {link.dividerBefore && (
                  <div className="w-px h-4 bg-white/10 mx-1.5 shrink-0" />
                )}
                <Link href={link.href}>
                  <span
                    className={cn(
                      "relative whitespace-nowrap px-2.5 lg:px-3 py-2 rounded text-sm font-medium cursor-pointer transition-colors duration-150",
                      isScanner && !isActive
                        ? "text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10 border border-cyan-500/20"
                        : isGem && !isActive
                        ? "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/20"
                        : isActive
                        ? "text-white bg-white/8"
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    )}
                  >
                    {link.name}
                    {link.badge && hasNewSignals && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
                    )}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>

        {/* ── Desktop Right Actions ── */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <NotificationCenter />
          <WalletConnect />
          <a href="/login">
            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white text-sm font-medium h-9">
              Sign In
            </Button>
          </a>
          <Link href="/scanner">
            <Button size="sm" className="bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm h-9 px-4">
              Live Scanner
            </Button>
          </Link>
        </div>

        {/* ── Mobile Right Actions ── */}
        <div className="flex md:hidden items-center gap-1.5">
          <NotificationCenter />
          <button
            type="button"
            className="relative w-11 h-11 flex items-center justify-center text-white/70 hover:text-white rounded-lg hover:bg-white/8 transition-colors z-[80]"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsMobileMenuOpen(prev => !prev);
            }}
            aria-label="Toggle menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* ── Mobile Menu (portaled to body to escape overflow clipping) ── */}
      {menuVisible && createPortal(
        <div
          className={cn(
            "md:hidden fixed inset-x-0 top-16 bottom-0 z-[75] overflow-y-auto overscroll-contain transition-all duration-300 ease-out",
            menuAnimating
              ? "bg-[#080a0c]/98 backdrop-blur-xl opacity-100 pointer-events-auto"
              : "bg-[#080a0c]/0 backdrop-blur-none opacity-0 pointer-events-none"
          )}
          onClick={(e) => {
            // Close menu when tapping the backdrop (not a link)
            if (e.target === e.currentTarget) closeMobile();
          }}
        >
          <div
            className={cn(
              "px-4 py-6 space-y-6 transition-all duration-300 ease-out",
              menuAnimating
                ? "translate-y-0 opacity-100"
                : "-translate-y-4 opacity-0"
            )}
          >

            {/* Two primary tool set CTAs */}
            <div className="grid grid-cols-2 gap-3">
              <Link href="/scanner" onClick={closeMobile}>
                <div className={cn(
                  "flex flex-col items-center gap-2 px-3 py-4 rounded-xl cursor-pointer transition-colors border",
                  location === "/scanner"
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                    : "bg-cyan-500/8 border-cyan-500/25 text-cyan-400 hover:bg-cyan-500/15"
                )}>
                  <Radar size={22} />
                  <div className="text-center">
                    <p className="text-sm font-bold">Live Scanner</p>
                    <p className="text-[10px] text-white/40 mt-0.5">FUTURES · PERP</p>
                  </div>
                </div>
              </Link>
              <Link href="/gem-finder" onClick={closeMobile}>
                <div className={cn(
                  "flex flex-col items-center gap-2 px-3 py-4 rounded-xl cursor-pointer transition-colors border",
                  location === "/gem-finder"
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                    : "bg-emerald-500/8 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/15"
                )}>
                  <Gem size={22} />
                  <div className="text-center">
                    <p className="text-sm font-bold">Gem Finder</p>
                    <p className="text-[10px] text-white/40 mt-0.5">SPOT ONLY</p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Full grouped nav */}
            {navGroups.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-2 px-2">
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">
                    {group.label}
                  </p>
                  {"badge" in group && (group as {badge?:string}).badge && (
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest border uppercase",
                      (group as {badge?:string}).badge === "FUTURES"
                        ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    )}>
                      {group.badge}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {group.links.map((link) => {
                    const Icon = link.icon;
                    const isActive = location === link.href;
                    return (
                      <Link key={link.name} href={link.href} onClick={closeMobile}>
                        <div className={cn(
                          "flex items-center justify-between px-3 py-3 rounded-lg cursor-pointer transition-colors",
                          isActive
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/5 hover:text-white"
                        )}>
                          <div className="flex items-center gap-3">
                            <Icon size={17} className={isActive ? "text-cyan-400" : "text-white/35"} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{link.name}</span>
                                {"badge" in link && !!(link as {badge?:boolean}).badge && hasNewSignals && (
                                  <span className="w-2 h-2 rounded-full bg-red-500" />
                                )}
                                {"highlight" in link && !!(link as {highlight?:boolean}).highlight && (
                                  <span className="px-1 py-0.5 rounded text-[8px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                                    PRIMARY
                                  </span>
                                )}
                              </div>
                              {"description" in link && (link as {description?:string}).description && (
                                <p className="text-[11px] text-white/30 mt-0.5">{link.description}</p>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={15} className="text-white/20 shrink-0" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Mobile Auth */}
            <div className="border-t border-white/8 pt-6 space-y-3">
              <Link href="/login" onClick={closeMobile}>
                <Button variant="outline" className="w-full h-12 text-base font-medium border-white/20 text-white hover:bg-white/5">
                  Sign In
                </Button>
              </Link>
              <Link href="/scanner" onClick={closeMobile}>
                <Button className="w-full h-12 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-base">
                  Live Scanner — Futures
                </Button>
              </Link>
              <div className="pt-2">
                <WalletConnect />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav>
  );
}

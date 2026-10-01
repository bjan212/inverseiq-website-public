import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WagmiProvider } from 'wagmi';
import { config } from "@/lib/web3";
import { Route, Switch } from "wouter";
import { lazy, Suspense } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SignalProvider } from "./contexts/SignalContext";
import { NotificationProvider } from "./contexts/NotificationContext";
const Home = lazy(() => import("./pages/Home"));
const Features = lazy(() => import("./pages/Features"));
const Docs = lazy(() => import("./pages/Docs"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Login = lazy(() => import("./pages/Login"));
const Platform = lazy(() => import("./pages/Platform"));
const Top3 = lazy(() => import("./pages/Top3"));
const ApiDocs = lazy(() => import("./pages/ApiDocs"));
const Stats = lazy(() => import("./pages/Stats"));
const Verification = lazy(() => import("./pages/Verification"));
const NotificationSettings = lazy(() => import("./pages/NotificationSettings"));
const AIStats = lazy(() => import("./pages/AIStats"));
const DemoApp = lazy(() => import("./demo-app/DemoApp"));
const BinanceSetup = lazy(() => import("./pages/BinanceSetup"));
const GemFinder = lazy(() => import("./pages/GemFinder"));
const TradeAnalyzer = lazy(() => import("./pages/TradeAnalyzer"));
const TradePredictor = lazy(() => import("./pages/TradePredictor"));
const FuturesScanner = lazy(() => import("./pages/FuturesScanner"));
const LiveScanner = lazy(() => import("./pages/LiveScanner"));
const MyPairs = lazy(() => import("./pages/MyPairs"));
const ActiveTrades = lazy(() => import("./pages/ActiveTrades"));
const TelegramSettings = lazy(() => import("./pages/TelegramSettings"));
const Gems = lazy(() => import("./pages/Gems"));
const UserSettings = lazy(() => import("./pages/UserSettings"));
const NotFound = lazy(() => import("./pages/NotFound"));
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/features"} component={Features} />
      <Route path={"/docs"} component={Docs} />
      <Route path={"/pricing"} component={Pricing} />
      <Route path={"/login"} component={Login} />
      <Route path={"/platform"} component={Platform} />
      <Route path={"/signals"} component={Top3} />
      <Route path={"/api"} component={ApiDocs} />
      <Route path={"/stats"} component={Stats} />
      <Route path={"/verification"} component={Verification} />
      <Route path={"/settings/notifications"} component={NotificationSettings} />
      <Route path={"/ai-stats"} component={AIStats} />
      <Route path={"/binance-setup"} component={BinanceSetup} />
      <Route path={"/gem-finder"} component={GemFinder} />
      <Route path={"/demo-trader"} component={DemoApp} />
      <Route path={"/trade-analyzer"} component={TradeAnalyzer} />
      <Route path={"/predict"} component={TradePredictor} />
      <Route path={"/scanner"} component={LiveScanner} />
      <Route path={"/futures-scanner"} component={FuturesScanner} />
      <Route path={"/deep-scanner"} component={LiveScanner} />
      <Route path={"/my-pairs"} component={MyPairs} />
      <Route path={"/active-trades"} component={ActiveTrades} />
      <Route path={"/settings/telegram"} component={TelegramSettings} />
      <Route path={"/gems"} component={Gems} />
      <Route path={"/settings"} component={UserSettings} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <WagmiProvider config={config}>
        <ThemeProvider
          defaultTheme="dark"
          // switchable
        >
          <SignalProvider>
            <NotificationProvider>
                <TooltipProvider>
                  <Toaster />
                  <Suspense fallback={<div className="min-h-screen bg-background text-foreground flex items-center justify-center font-rajdhani text-lg">Loading Xrypt…</div>}>
                    <Router />
                  </Suspense>
              </TooltipProvider>
            </NotificationProvider>
          </SignalProvider>
        </ThemeProvider>
      </WagmiProvider>
    </ErrorBoundary>
  );
}

export default App;

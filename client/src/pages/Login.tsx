import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Zap, TrendingUp, Gem } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Login() {
  const { isAuthenticated, loading } = useAuth();
  const [, setLocation] = useLocation();

  // If already authenticated, redirect to platform
  useEffect(() => {
    if (isAuthenticated && !loading) {
      setLocation("/platform");
    }
  }, [isAuthenticated, loading, setLocation]);

  const handleSignIn = () => {
    window.location.href = getLoginUrl();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-grow pt-20 flex items-center justify-center relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px]"></div>
        </div>

        <div className="container mx-auto px-4 relative z-10 py-20">
          <div className="max-w-md mx-auto bg-card/50 backdrop-blur-md border border-border/50 rounded-2xl p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Zap className="w-8 h-8 text-primary" />
              </div>
              <h1 className="font-bold tracking-tight text-3xl mb-2">SIGN IN TO XRYPT</h1>
              <p className="text-muted-foreground">Access your AI-powered trading dashboard</p>
            </div>

            {/* Features list */}
            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <TrendingUp className="w-4 h-4 text-primary flex-shrink-0" />
                <span>AI-powered perpetual futures signals</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Gem className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span>Spot market gem discovery</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <span>1-click execution on Hyperliquid & CEXs</span>
              </div>
            </div>

            {/* Sign In Button */}
            <Button 
              onClick={handleSignIn}
              className="w-full h-12 font-bold tracking-tight bg-primary text-black hover:bg-primary/90 shadow-[0_0_20px_rgba(0,240,255,0.3)]"
            >
              SIGN IN / CREATE ACCOUNT <ArrowRight className="ml-2 w-5 h-5" />
            </Button>

            <p className="text-xs text-center text-muted-foreground mt-4">
              New users will automatically have an account created on first sign-in.
            </p>

            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground font-mono">
              <ShieldCheck className="w-4 h-4 text-green-500" />
              SECURE ENCRYPTED CONNECTION
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

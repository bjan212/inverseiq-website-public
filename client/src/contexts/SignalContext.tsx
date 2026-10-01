import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";

interface SignalContextType {
  hasNewSignals: boolean;
  markSignalsAsRead: () => void;
}

const SignalContext = createContext<SignalContextType | undefined>(undefined);

export function SignalProvider({ children }: { children: React.ReactNode }) {
  const [hasNewSignals, setHasNewSignals] = useState(false);

  // Simulate real-time API polling
  useEffect(() => {
    // Initial check simulation
    const initialTimer = setTimeout(() => {
      setHasNewSignals(true);
      toast.info("New High-Confidence Signal Detected!", {
        description: "SUI/USDT Long setup is now available.",
        action: {
          label: "View",
          onClick: () => (window.location.href = "/signals"),
        },
      });
    }, 5000); // Trigger 5 seconds after load for demo purposes

    // Periodic polling simulation (every 2 minutes)
    const interval = setInterval(() => {
      // Randomly trigger a new signal for demo realism
      if (Math.random() > 0.7) {
        setHasNewSignals(true);
        toast.info("New Market Update", {
          description: "Volatility spike detected in major pairs.",
        });
      }
    }, 120000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  const markSignalsAsRead = () => {
    setHasNewSignals(false);
  };

  return (
    <SignalContext.Provider value={{ hasNewSignals, markSignalsAsRead }}>
      {children}
    </SignalContext.Provider>
  );
}

export function useSignals() {
  const context = useContext(SignalContext);
  if (context === undefined) {
    throw new Error("useSignals must be used within a SignalProvider");
  }
  return context;
}

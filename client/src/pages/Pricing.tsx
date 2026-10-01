import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

export default function Pricing() {
  const plans = [
    {
      name: "STARTER",
      price: "0",
      period: "/month",
      description: "Perfect for beginners learning the inverse strategy.",
      features: [
        "Basic Inverse Signals (Top 10 Coins)",
        "Daily Market Analysis",
        "Community Access",
        "Standard Support",
        "1 Exchange Connection"
      ],
      notIncluded: [
        "Real-time Futures Signals",
        "API Access",
        "Advanced Risk Management"
      ],
      cta: "START FREE",
      popular: false
    },
    {
      name: "PRO TRADER",
      price: "49",
      period: "/month",
      description: "For serious traders who need real-time edge.",
      features: [
        "All Starter Features",
        "Real-time Futures Signals (All Coins)",
        "Hybrid AI Engine Access",
        "3 Exchange Connections",
        "Priority Support",
        "Advanced Risk Management"
      ],
      notIncluded: [
        "API Access"
      ],
      cta: "START TRIAL",
      popular: true
    },
    {
      name: "INSTITUTIONAL",
      price: "199",
      period: "/month",
      description: "Full power for algorithmic trading and funds.",
      features: [
        "All Pro Features",
        "Unlimited Exchange Connections",
        "Full API Access",
        "Dedicated Account Manager",
        "Custom Strategy Development",
        "0ms Latency Execution"
      ],
      notIncluded: [],
      cta: "CONTACT SALES",
      popular: false
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-grow pt-20">
        <section className="py-20 text-center">
          <div className="container mx-auto px-4">
            <h1 className="font-bold tracking-tight text-4xl md:text-6xl mb-6">
              SIMPLE <span className="text-primary">PRICING</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-16">
              Choose the plan that fits your trading style. No hidden fees, cancel anytime.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {plans.map((plan, index) => (
                <div 
                  key={index}
                  className={`relative p-8 rounded-2xl border ${plan.popular ? 'border-primary bg-primary/5 shadow-[0_0_30px_rgba(0,240,255,0.1)]' : 'border-border/50 bg-card'} flex flex-col`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-black font-bold tracking-tight text-xs px-4 py-1 rounded-full">
                      MOST POPULAR
                    </div>
                  )}
                  
                  <div className="mb-8">
                    <h3 className="font-bold tracking-tight text-xl mb-2">{plan.name}</h3>
                    <div className="flex items-baseline justify-center gap-1 mb-4">
                      <span className="font-bold tracking-tight text-4xl">${plan.price}</span>
                      <span className=" text-muted-foreground">{plan.period}</span>
                    </div>
                    <p className=" text-muted-foreground text-sm">{plan.description}</p>
                  </div>

                  <div className="flex-grow space-y-4 mb-8 text-left">
                    {plan.features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </div>
                    ))}
                    {plan.notIncluded.map((feature, i) => (
                      <div key={i} className="flex items-start gap-3 opacity-50">
                        <X className="w-5 h-5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button 
                    className={`w-full font-bold tracking-tight h-12 ${plan.popular ? 'bg-primary text-black hover:bg-primary/90' : 'bg-secondary text-foreground hover:bg-secondary/80'}`}
                  >
                    {plan.cta}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

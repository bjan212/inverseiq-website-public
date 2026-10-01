import { Brain, Cpu, Code, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FeaturesShowcase() {
  const features = [
    {
      title: "INVERSE LEARNING",
      description: "Our algorithm analyzes your losing trades to identify consistent negative patterns, then inverts them into high-probability entry signals.",
      icon: <Brain className="w-10 h-10 text-primary" />,
      color: "border-primary/30 hover:border-primary/80",
      glow: "group-hover:shadow-[0_0_30px_rgba(0,240,255,0.2)]"
    },
    {
      title: "HYBRID AI ENGINE",
      description: "Combines deep learning neural networks with expert rule-based systems to deliver adaptive insights that work in both bull and bear markets.",
      icon: <Cpu className="w-10 h-10 text-purple-500" />,
      color: "border-purple-500/30 hover:border-purple-500/80",
      glow: "group-hover:shadow-[0_0_30px_rgba(168,85,247,0.2)]"
    },
    {
      title: "OPEN SOURCE",
      description: "Full transparency. Audit our core algorithms, contribute to the codebase, and verify exactly how your signals are generated.",
      icon: <Code className="w-10 h-10 text-green-500" />,
      color: "border-green-500/30 hover:border-green-500/80",
      glow: "group-hover:shadow-[0_0_30px_rgba(34,197,94,0.2)]"
    }
  ];

  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-bold tracking-tight text-3xl md:text-5xl mb-4">
            REVOLUTIONARY <span className="text-primary">FEATURES</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Powered by next-generation technology designed specifically for futures traders.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card 
              key={index} 
              className={`bg-card/50 backdrop-blur-sm border ${feature.color} transition-all duration-500 group cursor-pointer relative overflow-hidden`}
            >
              <div className={`absolute inset-0 opacity-0 transition-opacity duration-500 ${feature.glow}`}></div>
              
              <CardHeader className="relative z-10">
                <div className="mb-4 p-3 w-fit rounded-lg bg-background/50 border border-border/50">
                  {feature.icon}
                </div>
                <CardTitle className="font-bold tracking-tight text-xl tracking-wide flex items-center justify-between">
                  {feature.title}
                  <ArrowUpRight className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <p className="text-base md:text-lg text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors duration-300">
                  {feature.description}
                </p>
              </CardContent>
              
              {/* Decorative corner accents */}
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <div className="absolute bottom-0 left-0 w-2 h-2 bg-current opacity-50"></div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

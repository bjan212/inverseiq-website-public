import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Terminal, Copy, Check, Github, Book, Code2, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function Docs() {
  const [copied, setCopied] = useState(false);

  const copyCommand = () => {
    navigator.clipboard.writeText("git clone https://github.com/xrypt/core.git");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className="flex-grow pt-20">
        {/* Hero */}
        <section className="py-16 border-b border-border/30 bg-secondary/5">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8">
              <div>
                <h1 className="font-bold tracking-tight text-4xl md:text-5xl mb-4">
                  DEVELOPER <span className="text-primary">RESOURCES</span>
                </h1>
                <p className="text-xl text-muted-foreground max-w-xl">
                  Build, integrate, and innovate with Xrypt's open-source platform. Access our core algorithms and API documentation.
                </p>
              </div>
              <div className="flex gap-4">
                <Button variant="outline" className=" border-border hover:bg-secondary">
                  <Github className="mr-2 w-4 h-4" /> GITHUB
                </Button>
                <Button className=" bg-primary text-black font-bold hover:bg-primary/90">
                  API REFERENCE
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar Navigation */}
            <aside className="hidden lg:block space-y-8 sticky top-24 h-fit">
              <div>
                <h3 className="font-bold tracking-tight text-lg mb-4 text-primary">GETTING STARTED</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="hover:text-foreground cursor-pointer">Installation</li>
                  <li className="hover:text-foreground cursor-pointer">Configuration</li>
                  <li className="hover:text-foreground cursor-pointer">Quick Start Tutorial</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold tracking-tight text-lg mb-4 text-primary">CORE CONCEPTS</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="hover:text-foreground cursor-pointer">Inverse Learning</li>
                  <li className="hover:text-foreground cursor-pointer">Hybrid Architecture</li>
                  <li className="hover:text-foreground cursor-pointer">Signal Generation</li>
                </ul>
              </div>
              <div>
                <h3 className="font-bold tracking-tight text-lg mb-4 text-primary">API REFERENCE</h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="hover:text-foreground cursor-pointer">Authentication</li>
                  <li className="hover:text-foreground cursor-pointer">Endpoints</li>
                  <li className="hover:text-foreground cursor-pointer">WebSockets</li>
                </ul>
              </div>
            </aside>

            {/* Main Content */}
            <div className="lg:col-span-3 space-y-12">
              {/* Quick Start */}
              <section>
                <h2 className="font-bold tracking-tight text-2xl mb-6 flex items-center gap-2">
                  <Terminal className="text-primary" /> QUICK START
                </h2>
                <div className="bg-black/50 border border-border/50 rounded-xl p-6 font-mono text-sm relative group">
                  <div className="absolute top-4 right-4">
                    <button 
                      onClick={copyCommand}
                      className="p-2 hover:bg-white/10 rounded-md transition-colors"
                    >
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-muted-foreground mb-2"># Clone the repository</p>
                      <p className="text-green-400">$ git clone https://github.com/xrypt/core.git</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-2"># Install dependencies</p>
                      <p className="text-green-400">$ cd core && npm install</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-2"># Start the engine</p>
                      <p className="text-green-400">$ npm start</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Integration Cards */}
              <section>
                <h2 className="font-bold tracking-tight text-2xl mb-6 flex items-center gap-2">
                  <Code2 className="text-purple-500" /> INTEGRATION GUIDES
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 bg-card border border-border/50 rounded-xl hover:border-primary/50 transition-colors cursor-pointer">
                    <h3 className="font-bold tracking-tight text-lg mb-2">Python SDK</h3>
                    <p className=" text-muted-foreground mb-4">Official Python client for data analysis and bot integration.</p>
                    <div className="flex items-center text-primary text-sm font-bold">
                      VIEW DOCS <ArrowRight className="ml-2 w-4 h-4" />
                    </div>
                  </div>
                  <div className="p-6 bg-card border border-border/50 rounded-xl hover:border-primary/50 transition-colors cursor-pointer">
                    <h3 className="font-bold tracking-tight text-lg mb-2">Node.js Client</h3>
                    <p className=" text-muted-foreground mb-4">Lightweight Node.js wrapper for high-frequency trading apps.</p>
                    <div className="flex items-center text-primary text-sm font-bold">
                      VIEW DOCS <ArrowRight className="ml-2 w-4 h-4" />
                    </div>
                  </div>
                </div>
              </section>

              {/* Community */}
              <section className="bg-secondary/10 rounded-2xl p-8 border border-border/30">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                  <div>
                    <h2 className="font-bold tracking-tight text-2xl mb-2">JOIN THE COMMUNITY</h2>
                    <p className=" text-muted-foreground">Connect with other developers, share strategies, and contribute to the core.</p>
                  </div>
                  <div className="flex gap-4">
                    <Button variant="outline" className="">DISCORD</Button>
                    <Button variant="outline" className="">FORUM</Button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Code, Copy, Terminal, Shield, Key, Database, Zap, Play, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ApiDocs() {
  const [activeTab, setActiveTab] = useState("authentication");
  const [loadingEndpoint, setLoadingEndpoint] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [codeLanguage, setCodeLanguage] = useState<"curl" | "python" | "javascript">("curl");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const generateCodeSnippet = (method: string, path: string, language: string) => {
    const url = `https://api.xrypt.net${path}`;
    
    if (language === "python") {
      return `import requests

url = "${url}"
headers = {
    "Authorization": "Bearer YOUR_API_KEY"
}

response = requests.${method.toLowerCase()}(url, headers=headers)
print(response.json())`;
    }
    
    if (language === "javascript") {
      return `const url = "${url}";
const options = {
  method: "${method}",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY"
  }
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error("error:" + err));`;
    }

    // Default to cURL
    return `curl -X ${method} "${url}" \\
  -H "Authorization: Bearer YOUR_API_KEY"`;
  };

  const runRequest = async (path: string, defaultResponse: string) => {
    setLoadingEndpoint(path);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1000));
    setResponses(prev => ({ ...prev, [path]: defaultResponse }));
    setLoadingEndpoint(null);
    toast.success("Request executed successfully");
  };

  const endpoints = [
    {
      method: "GET",
      path: "/v1/signals/active",
      description: "Retrieve currently active high-confidence trading signals.",
      response: `{
  "signals": [
    {
      "pair": "SUI/USDT",
      "type": "LONG",
      "entry": 1.95,
      "tp": 2.45,
      "sl": 1.78,
      "confidence": 0.92
    }
  ]
}`
    },
    {
      method: "POST",
      path: "/v1/user/keys",
      description: "Securely submit exchange API keys for portfolio tracking.",
      response: `{
  "status": "success",
  "message": "Keys encrypted and stored securely.",
  "key_id": "k_8f92a..."
}`
    },
    {
      method: "GET",
      path: "/v1/market/sentiment",
      description: "Get real-time AI sentiment analysis for top 50 assets.",
      response: `{
  "sentiment_score": 78,
  "trend": "bullish",
  "volume_24h": "1.2B"
}`
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      
      <main className="flex-grow container mx-auto px-4 pt-32 pb-20">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* Sidebar Navigation */}
          <div className="lg:w-64 flex-shrink-0 space-y-8">
            <div>
              <h3 className="font-bold tracking-tight text-xl mb-4 text-primary">API REFERENCE</h3>
              <nav className="space-y-2">
                <button 
                  onClick={() => setActiveTab("authentication")}
                  className={`w-full text-left px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "authentication" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Authentication
                </button>
                <button 
                  onClick={() => setActiveTab("endpoints")}
                  className={`w-full text-left px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "endpoints" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Endpoints
                </button>
                <button 
                  onClick={() => setActiveTab("rate-limits")}
                  className={`w-full text-left px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === "rate-limits" ? "bg-primary/10 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground"}`}
                >
                  Rate Limits
                </button>
              </nav>
            </div>
            
            <div className="p-4 rounded-xl bg-card border border-border">
              <div className="flex items-center gap-2 mb-2 text-primary">
                <Shield className="w-5 h-5" />
                <span className="font-bold font-bold text-sm">ENTERPRISE</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">Need higher limits? Contact our sales team for enterprise access.</p>
              <Button variant="outline" size="sm" className="w-full border-primary/50 text-primary hover:bg-primary/10">Contact Sales</Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-grow max-w-4xl">
            <div className="mb-12">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">Xrypt API <span className="text-primary">v1.0</span></h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Integrate Xrypt's powerful AI trading intelligence directly into your own applications, bots, or dashboards. 
                Our REST API provides programmatic access to real-time signals, market sentiment, and portfolio analytics.
              </p>
            </div>

            {activeTab === "authentication" && (
              <div className="space-y-12 animate-fade-in">
                <section>
                  <h2 className="text-2xl font-bold tracking-tight mb-6 flex items-center gap-3">
                    <Key className="w-6 h-6 text-primary" />
                    Authentication
                  </h2>
                  <p className="text-muted-foreground mb-6 text-base md:text-lg">
                    All API requests must be authenticated using a Bearer Token in the HTTP header. 
                    You can generate your API key from the <a href="/platform" className="text-primary hover:underline">Developer Dashboard</a>.
                  </p>
                  
                  <div className="bg-black/50 rounded-xl border border-border overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-white/5">
                      <span className="text-xs font-mono text-muted-foreground">BASH</span>
                      <button onClick={() => copyToClipboard('curl -H "Authorization: Bearer YOUR_API_KEY" https://api.xrypt.net/v1/signals')} className="text-muted-foreground hover:text-white transition-colors">
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-6 font-mono text-sm text-green-400 overflow-x-auto">
                      curl -H "Authorization: Bearer YOUR_API_KEY" \<br/>
                      &nbsp;&nbsp;https://api.xrypt.net/v1/signals/active
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === "endpoints" && (
              <div className="space-y-12 animate-fade-in">
                <section>
                  <h2 className="text-2xl font-bold tracking-tight mb-6 flex items-center gap-3">
                    <Database className="w-6 h-6 text-primary" />
                    Core Endpoints
                  </h2>
                  
                  <div className="space-y-8">
                    {endpoints.map((endpoint, idx) => (
                      <div key={idx} className="border border-border rounded-xl overflow-hidden bg-card/30">
                        <div className="flex items-center gap-4 p-4 border-b border-border bg-white/5">
                          <span className={`px-3 py-1 rounded text-xs font-bold font-mono ${
                            endpoint.method === "GET" ? "bg-blue-500/20 text-blue-400" : "bg-green-500/20 text-green-400"
                          }`}>
                            {endpoint.method}
                          </span>
                          <span className="font-mono text-sm text-foreground">{endpoint.path}</span>
                        </div>
                        <div className="p-6">
                          <p className="text-muted-foreground mb-6">{endpoint.description}</p>

                          {/* Code Snippets */}
                          <div className="mb-8 border border-border rounded-lg overflow-hidden">
                            <div className="flex items-center border-b border-border bg-white/5">
                              <button 
                                onClick={() => setCodeLanguage("curl")}
                                className={`px-4 py-2 text-xs font-mono transition-colors ${codeLanguage === "curl" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                cURL
                              </button>
                              <button 
                                onClick={() => setCodeLanguage("python")}
                                className={`px-4 py-2 text-xs font-mono transition-colors ${codeLanguage === "python" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                Python
                              </button>
                              <button 
                                onClick={() => setCodeLanguage("javascript")}
                                className={`px-4 py-2 text-xs font-mono transition-colors ${codeLanguage === "javascript" ? "bg-primary/10 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                JavaScript
                              </button>
                            </div>
                            <div className="relative bg-black/50 p-4">
                              <button 
                                onClick={() => copyToClipboard(generateCodeSnippet(endpoint.method, endpoint.path, codeLanguage))} 
                                className="absolute top-2 right-2 p-2 hover:bg-white/10 rounded transition-colors"
                              >
                                <Copy className="w-4 h-4 text-muted-foreground" />
                              </button>
                              <pre className="text-sm font-mono text-blue-300 overflow-x-auto">
                                {generateCodeSnippet(endpoint.method, endpoint.path, codeLanguage)}
                              </pre>
                            </div>
                          </div>
                          
                          <div className="relative">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-mono text-muted-foreground uppercase">Response Preview</span>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => runRequest(endpoint.path, endpoint.response)}
                                  disabled={loadingEndpoint === endpoint.path}
                                  className="flex items-center gap-1 px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors disabled:opacity-50"
                                >
                                  {loadingEndpoint === endpoint.path ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Play className="w-3 h-3" />
                                  )}
                                  TRY IT OUT
                                </button>
                                <button onClick={() => copyToClipboard(endpoint.response)} className="p-1 hover:bg-white/10 rounded transition-colors">
                                  <Copy className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </div>
                            </div>
                            <pre className={`bg-black/50 rounded-lg p-4 text-sm font-mono overflow-x-auto transition-all duration-300 ${responses[endpoint.path] ? 'text-green-400 border border-green-500/30' : 'text-muted-foreground'}`}>
                              {responses[endpoint.path] || endpoint.response}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "rate-limits" && (
              <div className="space-y-12 animate-fade-in">
                <section>
                  <h2 className="text-2xl font-bold tracking-tight mb-6 flex items-center gap-3">
                    <Zap className="w-6 h-6 text-primary" />
                    Rate Limits
                  </h2>
                  <p className="text-muted-foreground mb-8 text-base md:text-lg">
                    API rate limits are applied per IP address and per API key. Exceeding these limits will result in a 
                    <code className="mx-2 px-2 py-1 bg-red-500/10 text-red-400 rounded border border-red-500/20">429 Too Many Requests</code> 
                    response.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="p-6 rounded-xl bg-card border border-border text-center">
                      <h3 className="font-bold tracking-tight text-lg mb-2">Free Tier</h3>
                      <div className="text-3xl font-bold text-primary mb-2">100</div>
                      <div className="text-sm text-muted-foreground">Requests / Minute</div>
                    </div>
                    <div className="p-6 rounded-xl bg-card border border-primary/30 shadow-[0_0_20px_rgba(0,240,255,0.1)] text-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-primary text-black text-[10px] font-bold px-2 py-1">POPULAR</div>
                      <h3 className="font-bold tracking-tight text-lg mb-2">Pro Tier</h3>
                      <div className="text-3xl font-bold text-primary mb-2">1,000</div>
                      <div className="text-sm text-muted-foreground">Requests / Minute</div>
                    </div>
                    <div className="p-6 rounded-xl bg-card border border-border text-center">
                      <h3 className="font-bold tracking-tight text-lg mb-2">Enterprise</h3>
                      <div className="text-3xl font-bold text-primary mb-2">Unlimited</div>
                      <div className="text-sm text-muted-foreground">Dedicated Nodes</div>
                    </div>
                  </div>
                </section>
              </div>
            )}

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

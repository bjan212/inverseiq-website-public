import { Link } from "wouter";
import { Github, Twitter, Linkedin, Disc } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-background border-t border-border/40 pt-16 pb-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand Column */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-primary rounded-sm flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary to-purple-600 opacity-80"></div>
                <span className="relative text-black font-bold tracking-tight text-xs">X</span>
              </div>
              <span className="font-bold tracking-tight text-lg tracking-wider text-foreground">
                XRYPT<span className="text-primary">.NET</span>
              </span>
            </div>
            <p className=" text-muted-foreground leading-relaxed">
              Transforming trading losses into learning opportunities through advanced AI and inverse pattern recognition.
            </p>
            <div className="flex gap-4 pt-2">
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Twitter size={20} />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Github size={20} />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Linkedin size={20} />
              </a>
              <a href="#" className="text-muted-foreground hover:text-primary transition-colors">
                <Disc size={20} />
              </a>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h4 className="font-bold tracking-tight text-foreground mb-6">PLATFORM</h4>
            <ul className="space-y-3 text-base md:text-lg">
              <li><Link href="/features"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Features</span></Link></li>
              <li><Link href="/pricing"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Pricing</span></Link></li>
              <li><Link href="/signals"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Signals</span></Link></li>
              <li><Link href="/roadmap"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Roadmap</span></Link></li>
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h4 className="font-bold tracking-tight text-foreground mb-6">RESOURCES</h4>
            <ul className="space-y-3 text-base md:text-lg">
              <li><Link href="/docs"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Documentation</span></Link></li>
              <li><Link href="/api"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">API Reference</span></Link></li>
              <li><Link href="/blog"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Blog</span></Link></li>
              <li><Link href="/community"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Community</span></Link></li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h4 className="font-bold tracking-tight text-foreground mb-6">COMPANY</h4>
            <ul className="space-y-3 text-base md:text-lg">
              <li><Link href="/about"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">About Us</span></Link></li>
              <li><Link href="/contact"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Contact</span></Link></li>
              <li><Link href="/privacy"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Privacy Policy</span></Link></li>
              <li><Link href="/terms"><span className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">Terms of Service</span></Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border/40 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className=" text-muted-foreground text-sm">
            © 2026 Xrypt.net. All rights reserved.
          </p>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="font-mono text-xs text-muted-foreground">SYSTEM STATUS: ONLINE</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

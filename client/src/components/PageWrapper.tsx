import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { ReactNode } from "react";

interface PageWrapperProps {
  children: ReactNode;
  /** Additional classes for the main content area */
  className?: string;
  /** Whether to show the footer (default: true) */
  showFooter?: boolean;
}

/**
 * Wraps any page with Navbar + Footer + proper spacing.
 * Use this on pages that don't already have their own Navbar.
 */
export default function PageWrapper({ children, className = "", showFooter = true }: PageWrapperProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />
      <main className={`flex-grow pt-20 ${className}`}>
        {children}
      </main>
      {showFooter && <Footer />}
    </div>
  );
}

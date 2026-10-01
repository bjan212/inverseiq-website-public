import React from 'react';
import { Route, Switch } from 'wouter';
import AiSetupFinder from './components/AiSetupFinder';
import Stats from './pages/Stats';

const DemoApp = () => {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <header className="mb-8 border-b border-border pb-4">
        <h1 className="text-3xl font-bold text-primary">Next-Gen Trader (Demo)</h1>
        <p className="text-muted-foreground">Scaffolded using 'crypto-trading-dev' skill</p>
      </header>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4">AI Signal Engine</h2>
            <AiSetupFinder />
          </section>
        </div>
        
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4">Performance Dashboard</h2>
            <div className="border border-border rounded-lg p-4 bg-card">
              <Stats />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default DemoApp;

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Button } from "@/components/ui/button";
import { Wallet, LogOut } from "lucide-react";

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-3 py-1.5 bg-primary/10 border border-primary/30 rounded-full font-mono text-xs text-primary">
          {address?.slice(0, 6)}...{address?.slice(-4)}
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => disconnect()}
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          title="Disconnect Wallet"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={() => connect({ connector: connectors[0] })}
      className=" border-primary/50 text-primary hover:bg-primary/10 gap-2"
    >
      <Wallet className="w-4 h-4" />
      CONNECT WALLET
    </Button>
  );
}

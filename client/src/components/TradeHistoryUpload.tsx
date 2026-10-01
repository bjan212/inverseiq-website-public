import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { TradeHistoryParser } from '@/lib/csvParser';
import { useTrades } from '@/contexts/TradeContext';

interface TradeHistoryUploadProps {
  onUploadComplete?: (trades: any[]) => void;
}

export default function TradeHistoryUpload({ onUploadComplete }: TradeHistoryUploadProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { setTrades, trades: currentTrades } = useTrades();
  const [uploadStats, setUploadStats] = useState<{ total: number; wins: number; losses: number } | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    
    try {
      const text = await file.text();
      
      // Use the robust parser
      const parsedTrades = TradeHistoryParser.parse(text);
      
      if (parsedTrades.length === 0) {
        throw new Error("No valid trades found in CSV");
      }

      // Simulate processing delay for UX
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update Global Context
      setTrades(parsedTrades);

      const wins = parsedTrades.filter(t => t.pnl > 0).length;
      const losses = parsedTrades.filter(t => t.pnl <= 0).length;

      setUploadStats({
        total: parsedTrades.length,
        wins,
        losses
      });

      if (onUploadComplete) {
        onUploadComplete(parsedTrades);
      }
      
      toast.success(`Successfully analyzed ${parsedTrades.length} trades`);
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error('Failed to parse trade history file. Ensure it matches Binance/Bybit format.');
    } finally {
      setIsProcessing(false);
    }
  }, [setTrades, onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv']
    },
    maxFiles: 1
  });

  if (uploadStats) {
    return (
      <div className="bg-card border border-border/50 rounded-xl p-6 text-center animate-in fade-in zoom-in">
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="font-bold tracking-tight text-xl mb-2">Analysis Complete</h3>
        <p className="text-muted-foreground text-sm mb-6">
          Your trade history has been integrated into the Inverse IQ engine.
        </p>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-background/50 p-3 rounded border border-border/30">
            <span className="text-xs text-muted-foreground block mb-1">TRADES</span>
            <span className="font-mono font-bold text-lg">{uploadStats.total}</span>
          </div>
          <div className="bg-green-500/10 p-3 rounded border border-green-500/20">
            <span className="text-xs text-green-500/70 block mb-1">WINS</span>
            <span className="font-mono font-bold text-lg text-green-500">{uploadStats.wins}</span>
          </div>
          <div className="bg-red-500/10 p-3 rounded border border-red-500/20">
            <span className="text-xs text-red-500/70 block mb-1">LOSSES</span>
            <span className="font-mono font-bold text-lg text-red-500">{uploadStats.losses}</span>
          </div>
        </div>

        <Button 
          variant="outline" 
          onClick={() => setUploadStats(null)}
          className="w-full"
        >
          Upload Different File
        </Button>
      </div>
    );
  }

  return (
    <div 
      {...getRootProps()} 
      className={`
        border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300
        ${isDragActive 
          ? 'border-primary bg-primary/5 scale-[1.02]' 
          : 'border-border/50 hover:border-primary/50 hover:bg-card/50'
        }
      `}
    >
      <input {...getInputProps()} />
      
      {isProcessing ? (
        <div className="py-8">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="font-bold tracking-tight text-lg">Analyzing Patterns...</p>
          <p className="text-sm text-muted-foreground mt-2">Inverting your losing trades</p>
        </div>
      ) : (
        <>
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          
          <h3 className="font-bold tracking-tight text-xl mb-2">Upload Trade History</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-xs mx-auto">
            Drag & drop your Binance/Bybit CSV export here to personalize the AI engine.
          </p>
          
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 bg-background/50 py-2 px-4 rounded-full inline-flex">
            <FileText className="w-3 h-3" />
            <span>Supports .CSV format only</span>
          </div>
        </>
      )}
    </div>
  );
}

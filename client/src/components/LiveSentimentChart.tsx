import { useEffect, useState } from "react";
import { Area, ComposedChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Scatter } from "recharts";
import { ArrowUpCircle, ArrowDownCircle } from "lucide-react";

const generateInitialData = () => {
  const data = [];
  const now = new Date();
  for (let i = 20; i > 0; i--) {
    const time = new Date(now.getTime() - i * 1000);
    data.push({
      time: time.toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      value: 50 + Math.random() * 30 - 15,
      volume: Math.floor(Math.random() * 1000) + 500,
      confidence: Math.floor(Math.random() * 20) + 80,
      signal: Math.random() > 0.9 ? (Math.random() > 0.5 ? "BUY" : "SELL") : null,
    });
  }
  return data;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-card/95 backdrop-blur-md border border-primary/30 p-4 rounded-lg shadow-[0_0_20px_rgba(0,240,255,0.15)] min-w-[200px]">
        <p className="font-mono text-xs text-muted-foreground mb-2 border-b border-border/50 pb-1">{label}</p>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">Sentiment:</span>
            <span className="font-mono font-bold text-primary">{data.value.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">Volume:</span>
            <span className="font-mono font-bold text-purple-400">{data.volume.toLocaleString()}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-foreground">AI Confidence:</span>
            <span className={`font-mono font-bold ${data.confidence > 90 ? 'text-green-400' : 'text-yellow-400'}`}>
              {data.confidence}%
            </span>
          </div>
          {data.signal && (
            <div className="flex justify-between items-center pt-2 border-t border-border/30 mt-2">
              <span className="text-sm text-foreground">Signal:</span>
              <span className={`font-bold tracking-tight ${data.signal === 'BUY' ? 'text-green-500' : 'text-red-500'}`}>
                {data.signal}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

const CustomizedDot = (props: any) => {
  const { cx, cy, payload } = props;
  if (!payload.signal) return null;

  if (payload.signal === "BUY") {
    return (
      <svg x={cx - 10} y={cy - 10} width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="m16 12-4-4-4 4" />
        <path d="M12 16V8" />
      </svg>
    );
  }
  
  return (
    <svg x={cx - 10} y={cy - 10} width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m8 12 4 4 4-4" />
      <path d="M12 8v8" />
    </svg>
  );
};

export default function LiveSentimentChart() {
  const [data, setData] = useState(generateInitialData());

  useEffect(() => {
    const interval = setInterval(() => {
      setData((currentData) => {
        const now = new Date();
        const newTime = now.toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const lastValue = currentData[currentData.length - 1].value;
        // Random walk
        let newValue = lastValue + (Math.random() * 10 - 5);
        // Clamp value
        newValue = Math.max(20, Math.min(95, newValue));

        const newData = [
          ...currentData.slice(1),
          { 
            time: newTime, 
            value: newValue,
            volume: Math.floor(Math.random() * 1000) + 500,
            confidence: Math.floor(Math.random() * 20) + 80,
            signal: Math.random() > 0.95 ? (Math.random() > 0.5 ? "BUY" : "SELL") : null,
          }
        ];
        return newData;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full h-full min-h-[350px] p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold tracking-tight text-lg text-primary">AI MARKET SENTIMENT</h3>
          <p className="text-xs text-muted-foreground">Real-time predictive analysis</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
          <span className="font-mono text-xs text-primary">LIVE FEED</span>
        </div>
      </div>
      
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} vertical={false} />
            <XAxis 
              dataKey="time" 
              stroke="var(--muted-foreground)" 
              fontSize={12} 
              tickLine={false}
              axisLine={false}
              fontFamily="var(--font-mono)"
            />
            <YAxis 
              stroke="var(--muted-foreground)" 
              fontSize={12} 
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              fontFamily="var(--font-mono)"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke="var(--primary)" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorValue)" 
              isAnimationActive={false}
            />
            <Scatter 
              dataKey="value" 
              shape={<CustomizedDot />} 
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

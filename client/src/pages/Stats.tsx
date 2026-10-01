import { useMemo, useState } from 'react';
import PageWrapper from "@/components/PageWrapper";
import { useTrades } from '@/contexts/TradeContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Activity, AlertTriangle, Filter, Calendar, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { subDays, startOfMonth, isAfter } from 'date-fns';
import { format } from 'date-fns';

export default function Stats() {
  const { trades, patterns } = useTrades();
  const [dateFilter, setDateFilter] = useState('all');
  const [assetFilter, setAssetFilter] = useState('all');

  // Extract unique assets from trades
  const assets = useMemo(() => {
    const uniqueAssets = new Set(trades.map(t => t.symbol));
    return Array.from(uniqueAssets).sort();
  }, [trades]);

  const filteredTrades = useMemo(() => {
    let filtered = [...trades];

    // Apply Date Filter
    const now = new Date();
    if (dateFilter === '7d') {
      const cutoff = subDays(now, 7);
      filtered = filtered.filter(t => isAfter(new Date(t.timestamp), cutoff));
    } else if (dateFilter === '30d') {
      const cutoff = subDays(now, 30);
      filtered = filtered.filter(t => isAfter(new Date(t.timestamp), cutoff));
    } else if (dateFilter === 'month') {
      const cutoff = startOfMonth(now);
      filtered = filtered.filter(t => isAfter(new Date(t.timestamp), cutoff));
    }

    // Apply Asset Filter
    if (assetFilter !== 'all') {
      filtered = filtered.filter(t => t.symbol === assetFilter);
    }

    return filtered;
  }, [trades, dateFilter, assetFilter]);

  const handleExportPDF = async () => {
    const element = document.getElementById('stats-dashboard');
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#09090b', // Match dark theme background
        logging: false,
        useCORS: true
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`Xrypt_Trading_Report_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const stats = useMemo(() => {
    if (filteredTrades.length === 0) return null;

    const totalTrades = filteredTrades.length;
    const wins = filteredTrades.filter(t => t.pnl > 0).length;
    const losses = filteredTrades.filter(t => t.pnl <= 0).length;
    const winRate = (wins / totalTrades) * 100;
    
    const totalPnL = filteredTrades.reduce((sum, t) => sum + t.pnl, 0);
    const avgWin = wins > 0 ? filteredTrades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0) / wins : 0;
    const avgLoss = losses > 0 ? filteredTrades.filter(t => t.pnl <= 0).reduce((sum, t) => sum + t.pnl, 0) / losses : 0;
    const profitFactor = Math.abs(avgLoss) > 0 ? (avgWin * wins) / Math.abs(avgLoss * losses) : 0;

    // Cumulative PnL for Chart
    let cumulative = 0;
    const pnlData = filteredTrades
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(t => {
        cumulative += t.pnl;
        return {
          date: format(new Date(t.timestamp), 'MMM dd'),
          pnl: cumulative,
          tradePnl: t.pnl
        };
      });

    return {
      totalTrades,
      wins,
      losses,
      winRate,
      totalPnL,
      avgWin,
      avgLoss,
      profitFactor,
      pnlData
    };
  }, [filteredTrades]);

  if (!stats) {
    return (
      <div className="container mx-auto p-6 min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md">
          <Activity className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h2 className="font-bold tracking-tight text-2xl mb-2">No Trade Data Available</h2>
          <p className="text-muted-foreground mb-6">
            Upload your trade history CSV in the Platform section to unlock your personalized trading statistics.
          </p>
        </div>
      </div>
    );
  }

  const COLORS = ['#22c55e', '#ef4444'];

  return (
    <PageWrapper><div id="stats-dashboard" className="container mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="font-bold tracking-tight text-3xl md:text-4xl bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
            MY TRADING STATS
          </h1>
          <p className="text-muted-foreground mt-1">
            Performance analysis based on {stats ? stats.totalTrades : 0} trades
          </p>
        </div>
        
        {/* Filters & Actions */}
        <div className="flex flex-wrap gap-2 items-center">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 gap-2 border-primary/20 hover:bg-primary/10 hover:text-primary"
            onClick={handleExportPDF}
            disabled={!stats}
          >
            <Download className="w-4 h-4" />
            Export PDF
          </Button>
          <div className="flex items-center gap-2 bg-card/50 border border-border/50 rounded-lg p-1">
            <Calendar className="w-4 h-4 text-muted-foreground ml-2" />
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-[140px] border-0 bg-transparent focus:ring-0 h-8">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 bg-card/50 border border-border/50 rounded-lg p-1">
            <Filter className="w-4 h-4 text-muted-foreground ml-2" />
            <Select value={assetFilter} onValueChange={setAssetFilter}>
              <SelectTrigger className="w-[140px] border-0 bg-transparent focus:ring-0 h-8">
                <SelectValue placeholder="All Assets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assets</SelectItem>
                {assets.map(asset => (
                  <SelectItem key={asset} value={asset}>{asset}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {stats && (
          <div className={`px-4 py-2 rounded-full border ${stats.totalPnL >= 0 ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'}`}>
            <span className="text-xs font-bold uppercase mr-2">Net PnL</span>
            <span className="font-mono font-bold text-xl">
              {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)} USDT
            </span>
          </div>
        )}
      </div>

      {!stats ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground">No trades found for the selected filters.</p>
          <Button 
            variant="link" 
            onClick={() => { setDateFilter('all'); setAssetFilter('all'); }}
            className="mt-2"
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Win Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats.winRate.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.wins} Wins / {stats.losses} Losses
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Profit Factor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats.profitFactor.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Target &gt; 1.5
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Win</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-green-500">+${stats.avgWin.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-red-500">${stats.avgLoss.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PnL Curve Chart */}
        <Card className="lg:col-span-2 bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="font-bold text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Equity Curve
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.pnlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#666" 
                  fontSize={12} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  stroke="#666" 
                  fontSize={12} 
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cumulative PnL']}
                />
                <Line 
                  type="monotone" 
                  dataKey="pnl" 
                  stroke="#0ea5e9" 
                  strokeWidth={2} 
                  dot={false} 
                  activeDot={{ r: 6, fill: '#0ea5e9' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Win/Loss Pie Chart */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader>
            <CardTitle className="font-bold text-lg flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Performance Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={[
                    { name: 'Wins', value: stats.wins },
                    { name: 'Losses', value: stats.losses }
                  ]}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {/* Green for Wins, Red for Losses */}
                  <Cell key="cell-0" fill={COLORS[0]} />
                  <Cell key="cell-1" fill={COLORS[1]} />
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm font-mono">Wins ({stats.wins})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-sm font-mono">Losses ({stats.losses})</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detected Patterns Section */}
      {patterns.length > 0 && (
        <Card className="bg-purple-500/5 border-purple-500/20">
          <CardHeader>
            <CardTitle className="font-bold text-lg flex items-center gap-2 text-purple-400">
              <AlertTriangle className="w-5 h-5" />
              AI Detected Weaknesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {patterns.map((pattern, idx) => (
                <div key={idx} className="bg-background/50 p-4 rounded border border-purple-500/20 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center shrink-0 text-purple-500 font-bold text-xs">
                    {pattern.confidence}%
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground mb-1">{pattern.type.replace('_', ' ')}</h4>
                    <p className="text-xs text-muted-foreground">{pattern.description}</p>
                    <div className="mt-2 text-xs font-mono text-purple-400 bg-purple-500/10 inline-block px-2 py-1 rounded">
                      SUGGESTION: {pattern.action}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      </>
      )}
    </div></PageWrapper>
  );
}

import { useState, useEffect } from 'react';
import { PredictionCard } from './components/PredictionCard';
import { ActiveBets } from './components/ActiveBets';
import { TrendingUp, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export interface Bet {
  id: string;
  asset: string;
  symbol: string;
  direction: 'up' | 'down';
  amount: number;
  entryPrice: number;
  startTime: number;
  duration: number; // 60 seconds
}

export interface Result {
  id: string;
  asset: string;
  symbol: string;
  direction: 'up' | 'down';
  amount: number;
  profit: number;
  won: boolean;
}

function App() {
  const [balance, setBalance] = useState(() => {
    const saved = localStorage.getItem('balance');
    return saved ? parseFloat(saved) : 1000;
  });
  const [activeBets, setActiveBets] = useState<Bet[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    localStorage.setItem('balance', balance.toString());
  }, [balance]);

  const handlePlaceBet = (bet: Omit<Bet, 'id' | 'startTime'>) => {
    if (balance < bet.amount) return;

    const newBet: Bet = {
      ...bet,
      id: `${Date.now()}-${Math.random()}`,
      startTime: Date.now(),
    };

    setBalance(prev => prev - bet.amount);
    setActiveBets(prev => [...prev, newBet]);
  };

  const handleBetResolved = (betId: string, won: boolean, profit: number) => {
    const bet = activeBets.find(b => b.id === betId);
    if (!bet) return;

    const result: Result = {
      id: betId,
      asset: bet.asset,
      symbol: bet.symbol,
      direction: bet.direction,
      amount: bet.amount,
      profit,
      won,
    };

    setResults(prev => [result, ...prev]);
    setActiveBets(prev => prev.filter(b => b.id !== betId));
    
    if (won) {
      setBalance(prev => prev + bet.amount + profit);
    }
  };

  return (
    <div className="h-screen bg-[#09090B] text-[#FAFAFA] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-[#27272A] px-4 md:px-6 py-4 flex-shrink-0">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#3B82F6] rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold">PredictX</span>
          </div>
          
          <div className="flex items-center gap-4">
            <motion.div 
              className="flex items-center gap-2"
              key={balance}
              initial={{ scale: 1.2 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 15 }}
            >
              <span className="text-[#71717A] hidden sm:inline">Balance:</span>
              <span className="text-xl md:text-2xl font-mono font-semibold text-[#22C55E]">
                ${balance.toFixed(2)}
              </span>
            </motion.div>

            {/* Toggle Sidebar Button */}
            <motion.button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="relative bg-[#18181B] border border-[#27272A] rounded-lg p-2 hover:bg-[#27272A] transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              {activeBets.length > 0 && !sidebarOpen && (
                <span className="absolute -top-1 -right-1 bg-[#3B82F6] text-white text-xs font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {activeBets.length}
                </span>
              )}
            </motion.button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        {/* Desktop Layout */}
        <div className="hidden md:flex h-full max-w-[1800px] mx-auto">
          {/* Prediction Card - Main Focus */}
          <div className="flex-1 p-6 overflow-auto scrollbar-thin scrollbar-thumb-[#27272A] scrollbar-track-transparent">
            <div className="max-w-[800px] mx-auto">
              <PredictionCard onPlaceBet={handlePlaceBet} balance={balance} onSwipe={() => {}} />
            </div>
          </div>

          {/* Active Bets Sidebar - Desktop */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 'auto', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="border-l border-[#27272A] overflow-hidden"
              >
                <div className="w-[400px] h-full p-6">
                  <ActiveBets bets={activeBets} onBetResolved={handleBetResolved} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden h-full flex flex-col">
          {/* Prediction Card */}
          <div className="flex-1 p-4 overflow-auto scrollbar-thin scrollbar-thumb-[#27272A] scrollbar-track-transparent">
            <PredictionCard 
              onPlaceBet={handlePlaceBet} 
              balance={balance} 
              onSwipe={(direction) => {
                if (direction > 0) {
                  setSidebarOpen(true);
                } else {
                  setSidebarOpen(false);
                }
              }}
              isCompressed={sidebarOpen}
            />
          </div>

          {/* Active Bets Sidebar - Mobile (from bottom) */}
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="border-t border-[#27272A] overflow-hidden flex-shrink-0"
              >
                <div className="h-[35vh] p-4">
                  <ActiveBets bets={activeBets} onBetResolved={handleBetResolved} isMobile />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

export default App;
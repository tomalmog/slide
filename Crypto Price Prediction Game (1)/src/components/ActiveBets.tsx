import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';
import type { Bet } from '../App';

interface Props {
  bets: Bet[];
  onBetResolved: (betId: string, won: boolean, profit: number) => void;
  isMobile?: boolean;
}

function BetItem({ bet, onResolved }: { bet: Bet; onResolved: (won: boolean, profit: number) => void }) {
  const [timeLeft, setTimeLeft] = useState(bet.duration);
  const [currentPrice, setCurrentPrice] = useState(bet.entryPrice);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - bet.startTime;
      const remaining = Math.max(0, bet.duration - elapsed);
      setTimeLeft(remaining);

      // Simulate price movement
      const priceChange = (Math.random() - 0.5) * (bet.entryPrice * 0.02);
      setCurrentPrice(prev => prev + priceChange);

      if (remaining === 0) {
        clearInterval(interval);
        
        // Determine win/loss
        const finalPrice = currentPrice;
        const won = bet.direction === 'up' 
          ? finalPrice > bet.entryPrice 
          : finalPrice < bet.entryPrice;
        
        const profit = won ? bet.amount * 0.85 : -bet.amount;
        
        setTimeout(() => {
          onResolved(won, profit);
        }, 100);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [bet, currentPrice, onResolved]);

  const progress = (timeLeft / bet.duration) * 100;
  const secondsLeft = Math.ceil(timeLeft / 1000);

  const priceDiff = currentPrice - bet.entryPrice;
  const isWinning = bet.direction === 'up' ? priceDiff > 0 : priceDiff < 0;

  return (
    <motion.div
      layout
      initial={{ scale: 0.8, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.8, opacity: 0, x: -100 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="relative bg-[#27272A]/30 rounded-xl p-4 overflow-hidden"
    >
      {/* Progress Bar Background */}
      <motion.div
        className={`absolute inset-0 ${isWinning ? 'bg-[#22C55E]/10' : 'bg-[#EF4444]/10'}`}
        initial={{ width: '100%' }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.1, ease: 'linear' }}
      />

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-base">{bet.symbol}</span>
            {bet.direction === 'up' ? (
              <TrendingUp className={`w-4 h-4 ${isWinning ? 'text-[#22C55E]' : 'text-[#EF4444]'}`} />
            ) : (
              <TrendingDown className={`w-4 h-4 ${isWinning ? 'text-[#22C55E]' : 'text-[#EF4444]'}`} />
            )}
          </div>
          
          <motion.div 
            className="flex items-center gap-2"
            animate={{ scale: secondsLeft <= 10 ? [1, 1.1, 1] : 1 }}
            transition={{ repeat: secondsLeft <= 10 ? Infinity : 0, duration: 1 }}
          >
            <Clock className="w-3 h-3 text-[#71717A]" />
            <span className={`font-mono font-semibold text-sm ${
              secondsLeft <= 10 ? 'text-[#EF4444]' : 'text-[#FAFAFA]'
            }`}>
              {secondsLeft}s
            </span>
          </motion.div>
        </div>

        {/* Details */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-[#71717A] mb-0.5">Bet</div>
            <div className="font-mono font-semibold">${bet.amount}</div>
          </div>
          <div>
            <div className="text-[#71717A] mb-0.5">Entry</div>
            <div className="font-mono">${bet.entryPrice.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[#71717A] mb-0.5">Current</div>
            <motion.div 
              className={`font-mono font-semibold ${isWinning ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}
              key={currentPrice}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 0.2 }}
            >
              {isWinning ? '+' : ''}{priceDiff.toFixed(2)}
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function ActiveBets({ bets, onBetResolved, isMobile = false }: Props) {
  return (
    <div className="bg-[#18181B] border border-[#27272A] rounded-2xl overflow-hidden flex flex-col h-full">
      <div className={`${isMobile ? 'px-3 py-2' : 'px-4 py-3'} border-b border-[#27272A] flex items-center justify-between flex-shrink-0`}>
        <h3 className={`${isMobile ? 'text-xs' : 'text-sm'} font-semibold text-[#71717A] uppercase tracking-wide`}>Active Bets</h3>
        {bets.length > 0 && (
          <span className="bg-[#3B82F6] text-white text-xs font-semibold px-2 py-1 rounded-full">
            {bets.length}
          </span>
        )}
      </div>
      
      <div className={`flex-1 ${isMobile ? 'p-2 space-y-2' : 'p-4 space-y-3'} overflow-y-auto scrollbar-thin scrollbar-thumb-[#27272A] scrollbar-track-transparent`}>
        <AnimatePresence mode="popLayout">
          {bets.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-center h-full text-[#71717A] text-sm"
            >
              No active bets
            </motion.div>
          ) : (
            bets.map((bet) => (
              <BetItem
                key={bet.id}
                bet={bet}
                onResolved={(won, profit) => onBetResolved(bet.id, won, profit)}
              />
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
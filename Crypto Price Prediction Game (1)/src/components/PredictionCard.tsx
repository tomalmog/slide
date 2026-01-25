import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TrendingUp, TrendingDown, ChevronDown } from 'lucide-react';
import type { Bet } from '../App';

const CRYPTO_ASSETS = [
  { name: 'Bitcoin', symbol: 'BTC', icon: '₿', basePrice: 43250 },
  { name: 'Ethereum', symbol: 'ETH', icon: 'Ξ', basePrice: 2280 },
  { name: 'Solana', symbol: 'SOL', icon: '◎', basePrice: 98 },
  { name: 'Cardano', symbol: 'ADA', icon: '₳', basePrice: 0.52 },
  { name: 'Polkadot', symbol: 'DOT', icon: '●', basePrice: 7.2 },
  { name: 'Avalanche', symbol: 'AVAX', icon: '▲', basePrice: 36.5 },
  { name: 'Polygon', symbol: 'MATIC', icon: '⬡', basePrice: 0.88 },
  { name: 'Chainlink', symbol: 'LINK', icon: '⬢', basePrice: 14.5 },
];

const BET_AMOUNTS = [1, 5, 10, 25];

interface Props {
  onPlaceBet: (bet: Omit<Bet, 'id' | 'startTime'>) => void;
  balance: number;
  onSwipe: (direction: number) => void;
  isCompressed?: boolean;
}

export function PredictionCard({ onPlaceBet, balance, onSwipe, isCompressed = false }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAmount, setSelectedAmount] = useState(5);
  const [touchStart, setTouchStart] = useState(0);
  const [direction, setDirection] = useState(0);

  const currentAsset = CRYPTO_ASSETS[currentIndex];
  
  // Simulate live price with small fluctuations
  const [currentPrice, setCurrentPrice] = useState(currentAsset.basePrice);
  const [change24h, setChange24h] = useState(() => (Math.random() - 0.5) * 10);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPrice(prev => {
        const fluctuation = (Math.random() - 0.5) * (currentAsset.basePrice * 0.001);
        return prev + fluctuation;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [currentAsset]);

  const handleSwipe = (newDirection: number) => {
    // On mobile, control sidebar; on desktop, change assets
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
      onSwipe(newDirection);
    } else {
      if (newDirection > 0) {
        // Swipe up - next asset
        setDirection(1);
        setCurrentIndex((prev) => (prev + 1) % CRYPTO_ASSETS.length);
      } else {
        // Swipe down - previous asset
        setDirection(-1);
        setCurrentIndex((prev) => (prev - 1 + CRYPTO_ASSETS.length) % CRYPTO_ASSETS.length);
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchStart - touchEnd;
    
    if (Math.abs(diff) > 50) {
      handleSwipe(diff > 0 ? 1 : -1);
    }
  };

  const handlePlaceBet = (betDirection: 'up' | 'down') => {
    if (balance < selectedAmount) return;

    onPlaceBet({
      asset: currentAsset.name,
      symbol: currentAsset.symbol,
      direction: betDirection,
      amount: selectedAmount,
      entryPrice: currentPrice,
      duration: 60000, // 60 seconds
    });

    // Auto advance to next asset with animation
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % CRYPTO_ASSETS.length);
  };

  return (
    <motion.div
      className="bg-[#18181B] border border-[#27272A] rounded-2xl p-6 md:p-8 relative overflow-hidden h-full flex flex-col justify-between"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      layout
    >
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentIndex}
          custom={direction}
          initial={(dir: number) => ({ 
            y: dir > 0 ? 100 : -100, 
            opacity: 0,
            scale: 0.8
          })}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={(dir: number) => ({ 
            y: dir > 0 ? -100 : 100, 
            opacity: 0,
            scale: 0.8
          })}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex flex-col justify-between h-full"
        >
          {/* Asset Header */}
          <div className={`flex items-center justify-center ${isCompressed ? 'mb-3' : 'mb-8 md:mb-12'}`}>
            <motion.div
              className={`${isCompressed ? 'text-3xl' : 'text-5xl md:text-6xl'} ${isCompressed ? 'mr-2' : 'mr-3 md:mr-4'}`}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 0.5 }}
            >
              {currentAsset.icon}
            </motion.div>
            <div>
              <h2 className={`${isCompressed ? 'text-lg' : 'text-2xl md:text-3xl'} font-semibold`}>{currentAsset.name}</h2>
              <p className={`text-[#71717A] ${isCompressed ? 'text-xs' : 'text-base md:text-lg'}`}>{currentAsset.symbol}</p>
            </div>
          </div>

          {/* Price Display */}
          <motion.div 
            className={`text-center ${isCompressed ? 'mb-3' : 'mb-8 md:mb-12'}`}
            key={currentPrice}
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 0.3 }}
          >
            <div className={`${isCompressed ? 'text-3xl' : 'text-5xl md:text-6xl lg:text-7xl'} font-mono font-bold ${isCompressed ? 'mb-1' : 'mb-3'}`}>
              ${currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full ${isCompressed ? 'text-xs' : 'text-sm'} ${
              change24h >= 0 ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#EF4444]/10 text-[#EF4444]'
            }`}>
              {change24h >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}% 24h
            </div>
          </motion.div>

          <div className={`w-full h-px bg-[#27272A] ${isCompressed ? 'my-3' : 'my-8 md:my-10'}`} />

          {/* Bet Amount Selector */}
          <div className={isCompressed ? 'mb-3' : 'mb-8 md:mb-10'}>
            <label className={`block ${isCompressed ? 'text-xs' : 'text-sm'} text-[#71717A] ${isCompressed ? 'mb-2' : 'mb-4'} text-center`}>BET AMOUNT</label>
            <div className="grid grid-cols-4 gap-2 md:gap-3">
              {BET_AMOUNTS.map((amount) => (
                <motion.button
                  key={amount}
                  onClick={() => setSelectedAmount(amount)}
                  className={`${isCompressed ? 'py-2 text-sm' : 'py-3 md:py-4'} rounded-lg font-mono font-semibold transition-all ${
                    selectedAmount === amount
                      ? 'bg-[#3B82F6] text-white'
                      : 'bg-[#27272A] text-[#71717A] hover:bg-[#3B82F6]/20'
                  }`}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={balance < amount}
                >
                  ${amount}
                </motion.button>
              ))}
            </div>
          </div>

          <div className={`w-full h-px bg-[#27272A] ${isCompressed ? 'my-3' : 'my-8 md:my-10'}`} />

          {/* UP/DOWN Buttons */}
          <div className={`grid grid-cols-2 gap-3 md:gap-4 ${isCompressed ? 'mb-3' : 'mb-8 md:mb-10'}`}>
            <motion.button
              onClick={() => handlePlaceBet('down')}
              className={`${isCompressed ? 'py-3' : 'py-6 md:py-7'} bg-[#EF4444] hover:bg-[#DC2626] rounded-xl font-semibold ${isCompressed ? 'text-sm' : 'text-lg md:text-xl'} transition-colors flex items-center justify-center gap-2`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={balance < selectedAmount}
            >
              <TrendingDown className={`${isCompressed ? 'w-4 h-4' : 'w-5 h-5'}`} />
              DOWN
            </motion.button>
            <motion.button
              onClick={() => handlePlaceBet('up')}
              className={`${isCompressed ? 'py-3' : 'py-6 md:py-7'} bg-[#22C55E] hover:bg-[#16A34A] rounded-xl font-semibold ${isCompressed ? 'text-sm' : 'text-lg md:text-xl'} transition-colors flex items-center justify-center gap-2`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={balance < selectedAmount}
            >
              <TrendingUp className={`${isCompressed ? 'w-4 h-4' : 'w-5 h-5'}`} />
              UP
            </motion.button>
          </div>

          {!isCompressed && (
            <>
              <div className="w-full h-px bg-[#27272A] my-6" />

              {/* Swipe Hint */}
              <motion.div 
                className="text-center text-[#71717A] text-sm flex items-center justify-center gap-2 md:hidden"
                animate={{ y: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <ChevronDown className="w-4 h-4" />
                Swipe up for active bets
              </motion.div>
              <motion.div 
                className="hidden md:flex text-center text-[#71717A] text-sm items-center justify-center gap-2"
                animate={{ y: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <ChevronDown className="w-4 h-4" />
                Swipe up to skip
              </motion.div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
import React from 'react';
import { motion } from 'framer-motion';
import { twMerge } from 'tailwind-merge';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  padding?: boolean;
}

const Card: React.FC<CardProps> = ({
  children,
  className,
  glow = false,
  padding = true
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ y: -2 }}
    transition={{ duration: 0.35, ease: 'easeOut' }}
    className={twMerge(
      'relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-800/70 backdrop-blur-sm shadow-sm overflow-hidden',
      glow ? 'before:absolute before:inset-0 before:-z-10 before:rounded-xl before:bg-gradient-to-r before:from-emerald-400/20 before:to-cyan-400/20 dark:before:from-emerald-400/10 dark:before:to-cyan-400/10' : '',
      padding ? 'p-4' : '',
      className
    )}
  >
    {children}
  </motion.div>
);

export default Card;
export { Card };
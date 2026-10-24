import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div
      className={`bg-neutral-900/50 border border-neutral-800/80 rounded-lg p-5 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

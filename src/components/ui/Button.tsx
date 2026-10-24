import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8FF00] focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap shrink-0 rounded-md active:scale-[0.98]';

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5 h-8',
    md: 'text-sm px-3.5 py-2 gap-2 h-9',
    lg: 'text-base px-4 py-2.5 gap-2.5 h-11',
  };

  const variantStyles = {
    primary:
      'bg-neutral-100 text-neutral-950 font-semibold border border-transparent shadow-xs hover:bg-[#B8FF00] hover:text-neutral-950 hover:border-[#B8FF00] hover:shadow-[0_0_16px_rgba(184,255,0,0.25)] active:bg-[#a3e600]',
    secondary:
      'bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 hover:border-neutral-700 active:bg-neutral-850',
    outline:
      'border border-neutral-800 text-neutral-300 hover:bg-neutral-900 hover:text-neutral-100 hover:border-neutral-700 active:bg-neutral-850',
    ghost:
      'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900 active:bg-neutral-800',
    danger:
      'bg-rose-950/40 text-rose-300 border border-rose-900/60 hover:bg-rose-900/40 active:bg-rose-900/60',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

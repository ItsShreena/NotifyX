import React from 'react';

export interface NotifyXIconProps {
  size?: number | string;
  className?: string;
  showSignals?: boolean;
}

/**
 * Geometric NotifyX "N" brand symbol with integrated notification signal transmission waves.
 * Rendered in Electric Lime (#B8FF00).
 */
export const NotifyXIcon: React.FC<NotifyXIconProps> = ({
  size = 24,
  className = '',
  showSignals = true,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {/* Left Pillar: solid vertical foundation */}
      <rect
        x="3.5"
        y="4"
        width="4"
        height="16.5"
        rx="1"
        fill="#B8FF00"
      />

      {/* Dynamic Diagonal Folding Blade */}
      <path
        d="M8.2 4.6L16.2 17V20.5H15.2L7.2 8.1V4.6H8.2Z"
        fill="#B8FF00"
      />

      {/* Right Pillar: signal transmission mast */}
      <rect
        x="15"
        y="8.2"
        width="4"
        height="12.3"
        rx="1"
        fill="#B8FF00"
      />

      {/* Three Notification Signal Transmission Rays broadcasting at upper right */}
      {showSignals && (
        <>
          {/* Inner broadcast wave */}
          <path
            d="M16.5 5.6A2.8 2.8 0 0 1 19.1 8.2"
            stroke="#B8FF00"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {/* Mid broadcast wave */}
          <path
            d="M16.5 3.3A5.1 5.1 0 0 1 21.4 8.2"
            stroke="#B8FF00"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {/* Outer broadcast wave */}
          <path
            d="M16.5 1A7.4 7.4 0 0 1 23.7 8.2"
            stroke="#B8FF00"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
};

export interface NotifyXLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'full' | 'icon' | 'wordmark';
  showSignals?: boolean;
  withContainer?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

/**
 * Reusable NotifyX Brand Identity component.
 * Displays the geometric Electric Lime "N" mark and the "Notify" (white) + "X" (Electric Lime) wordmark.
 */
export const NotifyXLogo: React.FC<NotifyXLogoProps> = ({
  size = 'md',
  variant = 'full',
  showSignals = true,
  withContainer = true,
  className = '',
  iconClassName = '',
  textClassName = '',
  onClick,
  ariaLabel = 'NotifyX Home',
}) => {
  const sizeMap = {
    sm: {
      icon: 18,
      container: 'w-6 h-6 rounded p-0.5',
      text: 'text-sm',
      gap: 'gap-2',
    },
    md: {
      icon: 20,
      container: 'w-7 h-7 rounded-md p-1',
      text: 'text-base',
      gap: 'gap-2.5',
    },
    lg: {
      icon: 26,
      container: 'w-9 h-9 rounded-lg p-1.5',
      text: 'text-xl',
      gap: 'gap-3',
    },
  };

  const currentSize = sizeMap[size];

  const renderIcon = () => {
    if (withContainer) {
      return (
        <div
          className={`${currentSize.container} bg-neutral-900/90 border border-neutral-800/80 flex items-center justify-center shadow-xs group-hover:border-[#B8FF00]/40 transition-colors shrink-0`}
        >
          <NotifyXIcon
            size={currentSize.icon}
            showSignals={showSignals}
            className={iconClassName}
          />
        </div>
      );
    }
    return (
      <NotifyXIcon
        size={currentSize.icon}
        showSignals={showSignals}
        className={iconClassName}
      />
    );
  };

  const renderWordmark = () => (
    <span
      className={`font-bold tracking-tight text-white leading-none ${currentSize.text} ${textClassName}`}
    >
      Notify<span className="text-[#B8FF00]">X</span>
    </span>
  );

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      aria-label={ariaLabel}
      className={`inline-flex items-center select-none ${currentSize.gap} ${
        onClick ? 'cursor-pointer' : ''
      } group ${className}`}
    >
      {variant !== 'wordmark' && renderIcon()}
      {variant !== 'icon' && renderWordmark()}
    </div>
  );
};

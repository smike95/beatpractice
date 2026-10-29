import React from 'react';

interface MetronomeIconProps {
  className?: string;
  size?: number;
}

export const MetronomeIcon: React.FC<MetronomeIconProps> = ({
  className = 'w-6 h-6',
  size
}) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lucide ${className}`}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden="true"
    >
      {/* Metronome base */}
      <path d="M6 21h12" />
      {/* Pyramid body */}
      <path d="m7.5 21 3.5-17h2l3.5 17" />
      {/* Pendulum needle */}
      <path d="M12 18 16.5 6.5" />
      {/* Pendulum sliding weight */}
      <circle cx="15.2" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
};

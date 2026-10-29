import React from 'react';

interface BeatPracticeLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

export const BeatPracticeLogo: React.FC<BeatPracticeLogoProps> = ({
  className = 'w-7 h-7',
  size,
  color = 'var(--brand-primary)'
}) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-label="BeatPractice Logo"
    >
      {/* Vertical stem of 'b' */}
      <rect x="28" y="14" width="4.8" height="52" rx="2.4" fill={color} />

      {/* Main circular bowl of 'b' - intact and unbroken */}
      <circle
        cx="52"
        cy="64"
        r="22"
        stroke={color}
        strokeWidth="4.8"
        fill="none"
      />

      {/* Central pivot circle */}
      <circle cx="52" cy="64" r="4.2" fill={color} />

      {/* Metronome / gauge needle pointing up-right at 45 deg */}
      <line
        x1="52"
        y1="64"
        x2="65"
        y2="51"
        stroke={color}
        strokeWidth="4.2"
        strokeLinecap="round"
      />
    </svg>
  );
};

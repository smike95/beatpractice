import React from 'react';

interface BeatPracticeLogoProps {
  className?: string;
  size?: number;
  color?: string;
}

/** The emblem of the application: the letter "b" whose bowl is a metronome dial. */
export const BeatPracticeLogo: React.FC<BeatPracticeLogoProps> = ({
  className = 'w-7 h-7',
  size,
  color = 'var(--brand-primary)'
}) => {
  return (
    <svg
      viewBox="0 0 1024 1400"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
      aria-label="BeatPractice Logo"
    >{/* the outline of the letter, the dial, the pivot and the needle: one path */}
      <path fill={color} fillRule="evenodd" d="M481.5,1398.9C236.9,1383.5 39.3,1206.7 6.0,973.5C-0.0,930.8 0.0,935.3 0.0,447.2L0.0,0.0L97.5,0.0L195.0,0.0L195.0,244.5L195.0,488.9L209.3,478.2C325.2,390.5 470.4,357.3 612.0,386.0C829.5,430.1 995.0,614.4 1020.4,841.0C1036.2,981.5 996.4,1115.1 907.4,1219.6L897.7,1231.1L842.8,1176.3C812.7,1146.2 788.0,1121.2 788.0,1120.9C788.0,1120.6 791.4,1116.1 795.6,1110.9C862.4,1028.3 884.4,917.0 856.0,805.0C830.7,705.1 762.5,618.3 672.0,570.7C585.0,525.0 479.7,519.1 388.0,554.7C229.7,616.1 133.3,787.9 161.1,958.8C185.4,1107.6 309.6,1221.5 469.5,1241.7C487.0,1243.9 534.9,1244.2 551.0,1242.2C614.8,1234.3 668.0,1215.0 717.8,1181.8C723.4,1178.1 728.4,1175.0 728.8,1175.0C730.3,1175.0 839.2,1284.8 838.6,1285.8C838.3,1286.3 832.9,1290.6 826.8,1295.3C729.0,1368.8 603.3,1406.6 481.5,1398.9ZM501.5,979.3C470.8,975.0 444.6,951.6 436.3,921.0C433.5,910.8 433.8,889.8 436.9,880.0C449.0,841.0 485.6,817.7 524.6,824.0L532.3,825.2L591.1,766.4L650.0,707.5L678.0,735.5L706.0,763.5L647.0,822.5L588.0,881.5L589.0,885.0C592.2,895.9 591.1,912.9 586.4,926.8C574.7,961.7 538.0,984.3 501.5,979.3Z" />
    </svg>
  );
};

import type { SVGProps } from "react";

export type PaperIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  variant?: "default" | "gold";
};

export function PaperIcon({
  size = 24,
  variant = "default",
  className,
  style,
  ...props
}: PaperIconProps) {
  const isGold = variant === "gold";

  // Detailed realistic colors
  const primary = isGold ? "#854d0e" : "#14532d";
  const secondary = isGold ? "#ca8a04" : "#166534";
  const accent = isGold ? "#eab308" : "#22c55e";
  const bg = isGold ? "#fef08a" : "#dcfce7";
  const innerBg = isGold ? "#fef9c3" : "#f0fdf4";

  return (
    <svg
      width={size}
      height={Math.round((size * 12) / 24)}
      viewBox="0 0 48 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ verticalAlign: "-2px", display: "inline-block", ...style }}
      aria-hidden="true"
      {...props}
    >
      <defs>
        {/* Subtle wavy texture pattern */}
        <pattern id={`waveTexture_${variant}`} width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 2 Q 1 0 2 2 T 4 2" fill="none" stroke={secondary} strokeWidth="0.2" opacity="0.4" />
        </pattern>
        {/* Gradient for a slight shiny/folded effect */}
        <linearGradient id={`billShine_${variant}`} x1="0" y1="0" x2="48" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor={bg} />
          <stop offset="0.3" stopColor={innerBg} />
          <stop offset="0.7" stopColor={bg} />
          <stop offset="1" stopColor={innerBg} />
        </linearGradient>
      </defs>

      {/* Main Bill Base with shadow */}
      <rect x="1.5" y="1.5" width="45" height="21" rx="1.5" fill={`url(#billShine_${variant})`} stroke={primary} strokeWidth="1" />
      
      {/* Background Texture Overlay */}
      <rect x="2.5" y="2.5" width="43" height="19" rx="1" fill={`url(#waveTexture_${variant})`} />

      {/* Intricate Inner Border */}
      <path
        d="M 4 4 L 44 4 L 44 20 L 4 20 Z"
        fill="none"
        stroke={secondary}
        strokeWidth="0.5"
      />
      <path
        d="M 5 5 L 43 5 L 43 19 L 5 19 Z"
        fill="none"
        stroke={primary}
        strokeWidth="0.5"
        strokeDasharray="1 1"
      />

      {/* Corner Ornaments */}
      <circle cx="6" cy="6" r="1" fill={primary} />
      <circle cx="42" cy="6" r="1" fill={primary} />
      <circle cx="6" cy="18" r="1" fill={primary} />
      <circle cx="42" cy="18" r="1" fill={primary} />
      
      {/* Corner Denomination / Watermarks */}
      <text x="8" y="7.5" fill={primary} fontSize="3" fontFamily="monospace" fontWeight="bold">1</text>
      <text x="38" y="7.5" fill={primary} fontSize="3" fontFamily="monospace" fontWeight="bold">1</text>
      <text x="8" y="19.5" fill={primary} fontSize="3" fontFamily="monospace" fontWeight="bold">1</text>
      <text x="38" y="19.5" fill={primary} fontSize="3" fontFamily="monospace" fontWeight="bold">1</text>

      {/* Center Medallion / Presidential Portrait frame */}
      <ellipse cx="24" cy="12" rx="6" ry="7" fill={innerBg} stroke={primary} strokeWidth="0.5" />
      <ellipse cx="24" cy="12" rx="5" ry="6" fill="none" stroke={secondary} strokeWidth="0.3" strokeDasharray="0.5 0.5" />

      {/* Medallion Core Design */}
      {isGold ? (
        // Detailed gold crown / star
        <path
          d="M 24 7.5 L 25.5 10 L 28 10.5 L 26 12.5 L 26.5 15.5 L 24 14 L 21.5 15.5 L 22 12.5 L 20 10.5 L 22.5 10 Z"
          fill={accent}
          stroke={primary}
          strokeWidth="0.3"
        />
      ) : (
        // Detailed eagle/pyramid shape (Illuminati vibes)
        <path
          d="M 24 7 L 27 15 L 21 15 Z"
          fill="none"
          stroke={primary}
          strokeWidth="0.5"
        />
      )}
      {!isGold && (
        <circle cx="24" cy="10" r="1" fill={primary} />
      )}

      {/* Side Decorative Seals */}
      <circle cx="14" cy="12" r="3" fill="none" stroke={secondary} strokeWidth="0.4" />
      <circle cx="14" cy="12" r="2.5" fill="none" stroke={secondary} strokeWidth="0.4" strokeDasharray="0.5 0.5" />
      <path d="M 13 12 L 15 12 M 14 11 L 14 13" stroke={primary} strokeWidth="0.4" />
      
      <circle cx="34" cy="12" r="3" fill="none" stroke={secondary} strokeWidth="0.4" />
      <path d="M 32.5 12 L 35.5 12" stroke={primary} strokeWidth="0.4" />
      
      {/* Signature Lines & Tiny Text block */}
      <path d="M 12 18 L 16 18" stroke={primary} strokeWidth="0.3" strokeLinecap="round" />
      <path d="M 32 18 L 36 18" stroke={primary} strokeWidth="0.3" strokeLinecap="round" />
      <path d="M 21 4.5 L 27 4.5" stroke={primary} strokeWidth="0.4" strokeLinecap="round" />
    </svg>
  );
}

import type { SVGProps } from "react";

export type PaperIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  variant?: "default" | "gold";
};

export function PaperIcon({
  size = 20,
  variant = "default",
  className,
  style,
  ...props
}: PaperIconProps) {
  const isGold = variant === "gold";

  return (
    <svg
      width={size}
      height={Math.round((size * 18) / 24)}
      viewBox="0 0 28 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ verticalAlign: "-2px", display: "inline-block", ...style }}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient
          id={isGold ? "goldGrad" : "paperGrad"}
          x1="0"
          y1="0"
          x2="28"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor={isGold ? "#fffbeb" : "#f4f8f3"} />
          <stop offset="1" stopColor={isGold ? "#fef3c7" : "#e3ede2"} />
        </linearGradient>
      </defs>

      {/* Banknote / Paper Bill Outer Body */}
      <rect
        x="1.5"
        y="1.5"
        width="25"
        height="17"
        rx="2.5"
        fill={`url(#${isGold ? "goldGrad" : "paperGrad"})`}
        stroke={isGold ? "#b45309" : "#243c2c"}
        strokeWidth="1.5"
      />

      {/* Decorative Guilloche Border */}
      <rect
        x="3.5"
        y="3.5"
        width="21"
        height="13"
        rx="1.5"
        fill="none"
        stroke={isGold ? "#d97706" : "#3d644a"}
        strokeWidth="0.8"
        strokeDasharray="2 1.2"
      />

      {/* Corner Security Marks */}
      <circle cx="5" cy="5" r="0.75" fill={isGold ? "#b45309" : "#243c2c"} />
      <circle cx="23" cy="5" r="0.75" fill={isGold ? "#b45309" : "#243c2c"} />
      <circle cx="5" cy="15" r="0.75" fill={isGold ? "#b45309" : "#243c2c"} />
      <circle cx="23" cy="15" r="0.75" fill={isGold ? "#b45309" : "#243c2c"} />

      {/* Center Medallion Seal */}
      <ellipse
        cx="14"
        cy="10"
        rx="4.5"
        ry="4"
        fill={isGold ? "#fde68a" : "#d1e3d0"}
        stroke={isGold ? "#92400e" : "#243c2c"}
        strokeWidth="1"
      />

      {/* Center Emblem: Crown for Gold, Classic V for Vibe */}
      {isGold ? (
        <path
          d="M14 7.2L14.9 9.1H16.8L15.3 10.2L15.9 12L14 10.9L12.1 12L12.7 10.2L11.2 9.1H13.1L14 7.2Z"
          fill="#b45309"
        />
      ) : (
        <path
          d="M12 8L14 12.2L16 8"
          stroke="#243c2c"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Engraving Hatch Lines */}
      <path d="M7 8.5H8.5" stroke={isGold ? "#d97706" : "#4a7458"} strokeWidth="0.8" strokeLinecap="round" />
      <path d="M7 11.5H8.5" stroke={isGold ? "#d97706" : "#4a7458"} strokeWidth="0.8" strokeLinecap="round" />
      <path d="M19.5 8.5H21" stroke={isGold ? "#d97706" : "#4a7458"} strokeWidth="0.8" strokeLinecap="round" />
      <path d="M19.5 11.5H21" stroke={isGold ? "#d97706" : "#4a7458"} strokeWidth="0.8" strokeLinecap="round" />
    </svg>
  );
}

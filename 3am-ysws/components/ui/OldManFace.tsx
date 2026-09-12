import type { SVGProps } from "react";

export function OldManFace({ size = 28, className, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Head shape */}
      <circle cx="16" cy="16" r="14" fill="#f5eedc" stroke="#181512" strokeWidth="2" />
      
      {/* Hair on sides & balding top wrinkle */}
      <path
        d="M3 13C2 17 4 20 6 21"
        stroke="#181512"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M29 13C30 17 28 20 26 21"
        stroke="#181512"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Forehead wrinkles */}
      <path d="M12 7H20" stroke="#8c8479" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 9.5H19" stroke="#8c8479" strokeWidth="1.5" strokeLinecap="round" />

      {/* Spectacles/Glasses */}
      {/* Left lens */}
      <circle cx="11.5" cy="14.5" r="3.5" fill="#ffffff" stroke="#181512" strokeWidth="1.8" />
      {/* Right lens */}
      <circle cx="20.5" cy="14.5" r="3.5" fill="#ffffff" stroke="#181512" strokeWidth="1.8" />
      {/* Bridge */}
      <path d="M15 14.5H17" stroke="#181512" strokeWidth="1.8" strokeLinecap="round" />
      {/* Glasses arms */}
      <path d="M8 14H4" stroke="#181512" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24 14H28" stroke="#181512" strokeWidth="1.5" strokeLinecap="round" />

      {/* Eyes inside glasses */}
      <circle cx="11.5" cy="14.5" r="1" fill="#181512" />
      <circle cx="20.5" cy="14.5" r="1" fill="#181512" />

      {/* Eyebrows */}
      <path d="M9 10C10.5 9 13 9.5 14 10.5" stroke="#181512" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M23 10C21.5 9 19 9.5 18 10.5" stroke="#181512" strokeWidth="1.6" strokeLinecap="round" />

      {/* Nose */}
      <path d="M16 14.5V18.5C15.5 19 14.8 19 14.5 18.5" stroke="#181512" strokeWidth="1.6" strokeLinecap="round" />

      {/* Classic Old Man Mustache */}
      <path
        d="M16 19.5C14.5 19 11.5 19.5 10 22C12.5 22.5 15 21 16 20.2C17 21 19.5 22.5 22 22C20.5 19.5 17.5 19 16 19.5Z"
        fill="#ffffff"
        stroke="#181512"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Smile/mouth under mustache */}
      <path d="M14 23C15 24 17 24 18 23" stroke="#181512" strokeWidth="1.5" strokeLinecap="round" />

      {/* Beard on chin */}
      <path
        d="M12.5 24.5C13.5 27.5 18.5 27.5 19.5 24.5"
        fill="#ffffff"
        stroke="#181512"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

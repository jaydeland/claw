import * as React from "react"
import { cn } from "../../lib/utils"

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  fill?: string
}

export function Logo({ fill = "currentColor", className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full", className)}
      aria-label="Claw logo"
      {...props}
    >
      {/* Curly braces at top */}
      <path
        d="M90 85 C85 85, 82 90, 82 100 C82 110, 85 115, 90 115 M110 85 C115 85, 118 90, 118 100 C118 110, 115 115, 110 115"
        fill="none"
        stroke={fill}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Top connector mount */}
      <rect x="88" y="65" width="24" height="6" fill={fill} rx="1" />

      {/* Central hub */}
      <circle cx="100" cy="78" r="4" fill={fill} />

      {/* Left arm - upper segment */}
      <path d="M96 78 L80 90" stroke={fill} strokeWidth="7" strokeLinecap="round" />
      <circle cx="78" cy="92" r="7" fill="transparent" stroke={fill} strokeWidth="3" />

      {/* Left arm - lower segment */}
      <path d="M78 99 L75 110" stroke={fill} strokeWidth="6" strokeLinecap="round" />
      <circle cx="74" cy="116" r="6" fill="transparent" stroke={fill} strokeWidth="3" />

      {/* Left claw tip */}
      <path d="M74 122 L85 138" stroke={fill} strokeWidth="5" strokeLinecap="round" />

      {/* Right arm - upper segment */}
      <path d="M104 78 L120 90" stroke={fill} strokeWidth="7" strokeLinecap="round" />
      <circle cx="122" cy="92" r="7" fill="transparent" stroke={fill} strokeWidth="3" />

      {/* Right arm - lower segment */}
      <path d="M122 99 L125 110" stroke={fill} strokeWidth="6" strokeLinecap="round" />
      <circle cx="126" cy="116" r="6" fill="transparent" stroke={fill} strokeWidth="3" />

      {/* Right claw tip */}
      <path d="M126 122 L115 138" stroke={fill} strokeWidth="5" strokeLinecap="round" />

      {/* Glow effect */}
      <defs>
        <radialGradient id="claw-glow">
          <stop offset="0%" stopColor={fill} stopOpacity="0.4" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="25" fill="url(#claw-glow)" />
    </svg>
  )
}

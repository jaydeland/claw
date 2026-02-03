import * as React from "react"
import { cn } from "../../lib/utils"

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string
  fill?: string
}

export function Logo({ fill = "currentColor", className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 400 400"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("w-full h-full", className)}
      aria-label="Claw logo"
      {...props}
    >
      {/* Robotic claw body/head */}
      <path
        d="M 150 100 L 150 80 L 180 80 L 180 60 L 220 60 L 220 80 L 250 80 L 250 100 L 270 100 L 270 160 L 130 160 L 130 100 Z"
        fill="none"
        stroke={fill}
        strokeWidth="20"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Eyes/bolts */}
      <circle cx="170" cy="120" r="12" fill={fill} />
      <circle cx="230" cy="120" r="12" fill={fill} />

      {/* Left arm - outer path */}
      <path
        d="M 130 140 L 90 180 L 90 240 L 50 280 L 50 350 L 90 390 L 130 350"
        fill="none"
        stroke={fill}
        strokeWidth="20"
        strokeLinejoin="miter"
        strokeLinecap="round"
      />
      {/* Left arm - inner path */}
      <path
        d="M 150 160 L 120 200 L 120 260 L 90 300 L 90 350"
        fill="none"
        stroke={fill}
        strokeWidth="20"
        strokeLinejoin="miter"
        strokeLinecap="round"
      />

      {/* Right arm - outer path */}
      <path
        d="M 270 140 L 310 180 L 310 240 L 350 280 L 350 350 L 310 390 L 270 350"
        fill="none"
        stroke={fill}
        strokeWidth="20"
        strokeLinejoin="miter"
        strokeLinecap="round"
      />
      {/* Right arm - inner path */}
      <path
        d="M 250 160 L 280 200 L 280 260 L 310 300 L 310 350"
        fill="none"
        stroke={fill}
        strokeWidth="20"
        strokeLinejoin="miter"
        strokeLinecap="round"
      />
    </svg>
  )
}

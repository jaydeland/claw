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
      {/* Left brace { */}
      <path
        d="M 120 120 Q 80 120 80 160 L 80 180 Q 80 200 60 200 Q 80 200 80 220 L 80 240 Q 80 280 120 280"
        fill="none"
        stroke={fill}
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Letter C */}
      <path
        d="M 285 128 Q 190 128 190 200 Q 190 272 285 272"
        fill="none"
        stroke={fill}
        strokeWidth="28"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Right brace } */}
      <path
        d="M 340 120 Q 380 120 380 160 L 380 180 Q 380 200 400 200 Q 380 200 380 220 L 380 240 Q 380 280 340 280"
        fill="none"
        stroke={fill}
        strokeWidth="24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

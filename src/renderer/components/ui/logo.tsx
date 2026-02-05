import * as React from "react"
import { cn } from "../../lib/utils"
import iconPng from "../../assets/icon.png"

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string
}

export function Logo({ className, ...props }: LogoProps) {
  return (
    <img
      src={iconPng}
      alt="Claw logo"
      className={cn("w-full h-full animate-heartbeat", className)}
      {...props}
    />
  )
}

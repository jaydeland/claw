import { Check } from "lucide-react"
import { IconSidePeek, IconCenterPeek, IconFullPage } from "@/components/ui/icons"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DisplayMode } from "../types"

const LAYOUT_MODES = [
  {
    value: "side-peek" as const,
    label: "Sidebar",
    Icon: IconSidePeek,
  },
  {
    value: "center-peek" as const,
    label: "Dialog",
    Icon: IconCenterPeek,
  },
  {
    value: "full-page" as const,
    label: "Fullscreen",
    Icon: IconFullPage,
  },
]

interface LoadedContextViewModeSwitcherProps {
  mode: DisplayMode
  onModeChange: (mode: DisplayMode) => void
}

export function LoadedContextViewModeSwitcher({ mode, onModeChange }: LoadedContextViewModeSwitcherProps) {
  const currentMode = LAYOUT_MODES.find((m) => m.value === mode) ?? LAYOUT_MODES[0]
  const CurrentIcon = currentMode.Icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="h-6 w-6 p-0 flex-shrink-0 flex items-center justify-center rounded hover:bg-foreground/10"
        >
          <CurrentIcon className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LAYOUT_MODES.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onModeChange(value)}
            className="flex items-center gap-2"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            {mode === value && (
              <Check className="h-4 w-4 text-muted-foreground ml-auto" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

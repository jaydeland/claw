import { Provider as JotaiProvider, useAtomValue, useSetAtom } from "jotai"
import { ThemeProvider, useTheme } from "next-themes"
import { useEffect, useMemo } from "react"
import { Toaster } from "sonner"
import { TooltipProvider } from "./components/ui/tooltip"
import { TRPCProvider } from "./contexts/TRPCProvider"
import { selectedProjectAtom } from "./features/agents/atoms"
import { AgentsLayout } from "./features/layout/agents-layout"
import {
  AnthropicOnboardingPage,
  ApiKeyOnboardingPage,
  AwsBedrockOnboardingPage,
  BillingMethodPage,
  SelectRepoPage,
} from "./features/onboarding"
import {
  anthropicOnboardingCompletedAtom,
  apiKeyOnboardingCompletedAtom,
  awsBedrockOnboardingCompletedAtom,
  billingMethodAtom,
  activeProviderAtom
} from "./lib/atoms"
import { appStore } from "./lib/jotai-store"
import { VSCodeThemeProvider } from "./lib/themes/theme-provider"
import { trpc } from "./lib/trpc"

/**
 * Custom Toaster that adapts to theme
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme()

  return (
    <Toaster
      position="bottom-right"
      theme={resolvedTheme as "light" | "dark" | "system"}
      closeButton
    />
  )
}

/**
 * Main content router - decides which page to show based on onboarding state
 */
function AppContent() {
  const billingMethod = useAtomValue(billingMethodAtom)
  const setBillingMethod = useSetAtom(billingMethodAtom)
  const [activeProvider, setActiveProvider] = useAtom(activeProviderAtom)
  const anthropicOnboardingCompleted = useAtomValue(
    anthropicOnboardingCompletedAtom
  )
  const apiKeyOnboardingCompleted = useAtomValue(apiKeyOnboardingCompletedAtom)
  const awsBedrockOnboardingCompleted = useAtomValue(awsBedrockOnboardingCompletedAtom)
  const selectedProject = useAtomValue(selectedProjectAtom)

  // Migration: If user already completed Anthropic onboarding but has no billing method set,
  // automatically set it to "claude-subscription" (legacy users before billing method was added)
  useEffect(() => {
    if (!billingMethod && anthropicOnboardingCompleted) {
      setBillingMethod("claude-subscription")
    }
  }, [billingMethod, anthropicOnboardingCompleted, setBillingMethod])

  // Migration: Convert old billingMethod to new activeProvider
  // This ensures existing users transition smoothly to the new provider system
  useEffect(() => {
    if (billingMethod && !activeProvider) {
      const providerMapping = {
        "claude-subscription": "anthropic-oauth" as const,
        "api-key": "custom-api" as const, // API key is handled as custom API
        "custom-model": "custom-api" as const,
        "aws-bedrock": "aws-bedrock" as const,
      }
      const mappedProvider = providerMapping[billingMethod]
      if (mappedProvider) {
        setActiveProvider(mappedProvider)
      }
    }
  }, [billingMethod, activeProvider, setActiveProvider])

  // Fetch projects to validate selectedProject exists
  const { data: projects, isLoading: isLoadingProjects } =
    trpc.projects.list.useQuery()

  // Validated project - only valid if exists in DB
  const validatedProject = useMemo(() => {
    if (!selectedProject) return null
    // While loading, trust localStorage value to prevent flicker
    if (isLoadingProjects) return selectedProject
    // After loading, validate against DB - but be lenient
    if (!projects || projects.length === 0) {
      // If projects list is empty or not loaded, trust the selected project
      return selectedProject
    }
    const exists = projects.some((p) => p.id === selectedProject.id)
    return exists ? selectedProject : null
  }, [selectedProject, projects, isLoadingProjects])

  // Determine which page to show:
  // 1. No billing method selected -> BillingMethodPage
  // 2. Claude subscription selected but not completed -> AnthropicOnboardingPage
  // 3. API key or custom model selected but not completed -> ApiKeyOnboardingPage
  // 4. AWS Bedrock selected but not completed -> AwsBedrockOnboardingPage
  // 5. No valid project selected -> SelectRepoPage
  // 6. Otherwise -> AgentsLayout
  if (!billingMethod) {
    return <BillingMethodPage />
  }

  if (billingMethod === "claude-subscription" && !anthropicOnboardingCompleted) {
    return <AnthropicOnboardingPage />
  }

  if (
    (billingMethod === "api-key" || billingMethod === "custom-model") &&
    !apiKeyOnboardingCompleted
  ) {
    return <ApiKeyOnboardingPage />
  }

  if (billingMethod === "aws-bedrock" && !awsBedrockOnboardingCompleted) {
    return <AwsBedrockOnboardingPage />
  }

  if (!validatedProject && !isLoadingProjects) {
    return <SelectRepoPage />
  }

  return <AgentsLayout />
}

export function App() {
  return (
    <JotaiProvider store={appStore}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <VSCodeThemeProvider>
          <TooltipProvider delayDuration={100}>
            <TRPCProvider>
              <div
                data-agents-page
                className="h-screen w-screen bg-background text-foreground overflow-hidden"
              >
                <AppContent />
              </div>
              <ThemedToaster />
            </TRPCProvider>
          </TooltipProvider>
        </VSCodeThemeProvider>
      </ThemeProvider>
    </JotaiProvider>
  )
}

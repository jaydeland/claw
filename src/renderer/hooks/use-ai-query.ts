import { useState } from "react"
import { toast } from "sonner"
import { trpc } from "../lib/trpc"

export function useAiQuery() {
  const [isLoading, setIsLoading] = useState(false)

  const queryPromptMutation = trpc.claude.queryPrompt.useMutation({
    onSuccess: (result) => {
      if (!result.success) {
        toast.error(result.error || "Failed to get AI response")
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to query AI")
    },
  })

  const queryAi = async (
    prompt: string,
    options?: { model?: "haiku" | "sonnet" | "opus"; maxTokens?: number }
  ) => {
    setIsLoading(true)
    const toastId = toast.loading("Generating with AI...")

    try {
      const result = await queryPromptMutation.mutateAsync({
        prompt,
        model: options?.model,
        maxTokens: options?.maxTokens,
      })

      toast.dismiss(toastId)
      setIsLoading(false)
      return result
    } catch (error) {
      toast.dismiss(toastId)
      setIsLoading(false)
      throw error
    }
  }

  return { queryAi, isLoading }
}

export interface LoadingStep {
  id: string
  labelKey: string
  completed: boolean
}

const MIN_STEP_DURATION = 300 // minimum ms per step for smooth feeling

const isLoading = ref(true)
const isReady = ref(false)
const currentStepIndex = ref(0)
const steps = ref<LoadingStep[]>([])
const error = ref<string | null>(null)
let lastStepTime = 0

export function useAppLoading() {
  const progress = computed(() => {
    if (steps.value.length === 0) return 0
    const completedCount = steps.value.filter(s => s.completed).length
    return Math.round((completedCount / steps.value.length) * 100)
  })

  const currentStep = computed(() => {
    return steps.value[currentStepIndex.value] ?? null
  })

  const initSteps = (newSteps: Array<{ id: string, labelKey: string }>) => {
    steps.value = newSteps.map(s => ({ ...s, completed: false }))
    currentStepIndex.value = 0
    isLoading.value = true
    isReady.value = false
    error.value = null
    lastStepTime = Date.now()
  }

  const completeStep = (stepId: string) => {
    const index = steps.value.findIndex(s => s.id === stepId)
    if (index !== -1 && steps.value[index]) {
      steps.value[index].completed = true
      if (currentStepIndex.value === index && index < steps.value.length - 1) {
        currentStepIndex.value = index + 1
      }
      lastStepTime = Date.now()
    }
  }

  const completeStepWithDelay = async (stepId: string) => {
    const elapsed = Date.now() - lastStepTime
    const remaining = MIN_STEP_DURATION - elapsed
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining))
    }
    completeStep(stepId)
  }

  const setError = (message: string) => {
    error.value = message
  }

  const markReady = async () => {
    // Ensure minimum time for last step
    const elapsed = Date.now() - lastStepTime
    const remaining = MIN_STEP_DURATION - elapsed
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining))
    }
    steps.value.forEach(s => s.completed = true)
    isReady.value = true
  }

  const dismiss = () => {
    isLoading.value = false
  }

  const finishLoading = () => {
    steps.value.forEach(s => s.completed = true)
    isLoading.value = false
  }

  const reset = () => {
    steps.value = []
    currentStepIndex.value = 0
    isLoading.value = true
    isReady.value = false
    error.value = null
    lastStepTime = Date.now()
  }

  return {
    isLoading: readonly(isLoading),
    isReady: readonly(isReady),
    progress,
    currentStep,
    steps: readonly(steps),
    error: readonly(error),
    initSteps,
    completeStep,
    completeStepWithDelay,
    setError,
    markReady,
    dismiss,
    finishLoading,
    reset
  }
}

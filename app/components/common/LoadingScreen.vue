<script setup lang="ts">
const { t } = useI18n()
const appLoading = useAppLoading()
const { isLoading, steps, error } = appLoading

const showCursor = ref(true)
const typedCommand = ref('')
const commandComplete = ref(false)

// Display queue: steps are shown with minimum 300ms each, independent of backend completion
const displayedSteps = ref<string[]>([])
const MIN_DISPLAY_DURATION = 300
const displayQueue: string[] = []
let isProcessingQueue = false
let lastDisplayTime = 0

const BOOT_COMMAND = './ascension --init-core --wake --sector=7'

defineEmits<{
  retry: []
}>()

// Blinking cursor effect
let cursorInterval: ReturnType<typeof setInterval> | null = null

// Process the display queue - show steps one at a time with minimum delay
const processDisplayQueue = async () => {
  if (isProcessingQueue) return
  isProcessingQueue = true

  while (displayQueue.length > 0) {
    const elapsed = Date.now() - lastDisplayTime
    const remaining = MIN_DISPLAY_DURATION - elapsed
    if (remaining > 0) {
      await new Promise(resolve => setTimeout(resolve, remaining))
    }

    const stepId = displayQueue.shift()
    if (stepId) {
      displayedSteps.value.push(stepId)
      lastDisplayTime = Date.now()
    }
  }

  isProcessingQueue = false
}

// Typing effect for boot command
const typeCommand = async () => {
  for (let i = 0; i <= BOOT_COMMAND.length; i++) {
    typedCommand.value = BOOT_COMMAND.slice(0, i)
    await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * 20))
  }
  await new Promise(resolve => setTimeout(resolve, 200))
  commandComplete.value = true
  lastDisplayTime = Date.now() // Start timing from when command completes
  processDisplayQueue() // Start processing any queued steps
}

onMounted(() => {
  cursorInterval = setInterval(() => {
    showCursor.value = !showCursor.value
  }, 530)

  // Start typing the command
  typeCommand()

  // Listen for keypress or click to dismiss
  window.addEventListener('keydown', handleDismiss)
  window.addEventListener('click', handleDismiss)
})

onUnmounted(() => {
  if (cursorInterval) clearInterval(cursorInterval)
  window.removeEventListener('keydown', handleDismiss)
  window.removeEventListener('click', handleDismiss)
})

// Ready to dismiss when all steps are displayed
const displayComplete = computed(() => {
  return displayedSteps.value.length === steps.value.length && steps.value.length > 0
})

const handleDismiss = () => {
  if (displayComplete.value && !error.value) {
    appLoading.dismiss()
  }
}

// Watch for newly completed steps and queue them for display
watch(steps, (newSteps) => {
  newSteps.forEach((step) => {
    if (step.completed && !displayedSteps.value.includes(step.id) && !displayQueue.includes(step.id)) {
      displayQueue.push(step.id)
      // Only start processing if command is already complete
      if (commandComplete.value) {
        processDisplayQueue()
      }
    }
  })
}, { deep: true, immediate: true })

// Get the displayed terminal lines with translations
const terminalLines = computed(() => {
  return displayedSteps.value.map((stepId) => {
    const step = steps.value.find(s => s.id === stepId)
    return step ? t(step.labelKey) : stepId
  })
})

// Current step is the first step that's not yet displayed
const currentStepText = computed(() => {
  const nextStep = steps.value.find(s => !displayedSteps.value.includes(s.id))
  if (nextStep) {
    return t(nextStep.labelKey)
  }
  return null
})
</script>

<template>
  <Transition name="fade">
    <div
      v-if="isLoading"
      class="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer"
      @click="handleDismiss"
    >
      <!-- Background Image with Overlay (same as homepage) -->
      <div class="absolute inset-0 z-0">
        <div
          class="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style="background-image: url('/background1.png')"
        />
        <div class="absolute inset-0 bg-linear-to-b from-neutral-950/70 via-neutral-950/85 to-neutral-950" />
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_60%_30%,rgba(167,139,250,0.1),transparent_50%)]" />
      </div>

      <!-- Content Container -->
      <div class="relative z-10 flex flex-col items-center w-full max-w-3xl px-4 py-8">
        <!-- Terminal Window -->
        <div class="w-full rounded-lg overflow-hidden shadow-2xl border border-neutral-700/50 bg-black/90 backdrop-blur-sm">
          <!-- Terminal Title Bar -->
          <div class="flex items-center gap-2 px-4 py-2 bg-neutral-800/90 border-b border-neutral-700">
            <div class="flex gap-1.5">
              <div class="w-3 h-3 rounded-full bg-error-500/80" />
              <div class="w-3 h-3 rounded-full bg-warning-500/80" />
              <div class="w-3 h-3 rounded-full bg-success-500/80" />
            </div>
            <span class="text-neutral-400 text-xs font-mono ml-2">ascension@terminal ~ boot</span>
          </div>

          <!-- Scanlines overlay for CRT effect -->
          <div class="pointer-events-none absolute inset-0 scanlines rounded-lg" />

          <!-- Terminal Content -->
          <div class="p-4 md:p-6 font-mono text-xs md:text-sm h-96 overflow-y-auto">
            <!-- Initial Command Prompt with Typing Effect -->
            <div class="mb-4">
              <div class="flex items-center text-neutral-500">
                <span class="text-primary-500">root@ascension</span>
                <span class="text-neutral-600">:</span>
                <span class="text-info-400">~</span>
                <span class="text-neutral-600">$</span>
                <span class="text-success-400 ml-2">{{ typedCommand }}</span>
                <span
                  v-if="!commandComplete && showCursor"
                  class="w-2 h-4 bg-success-400 inline-block"
                />
              </div>
            </div>

            <!-- Show rest only after command is typed -->
            <template v-if="commandComplete">
              <!-- Header -->
              <div class="text-neutral-500 mb-4 border-b border-neutral-800 pb-2">
                {{ t('loading.terminal-header') }}
              </div>

              <!-- Completed Steps -->
              <div class="space-y-1">
                <div
                  v-for="(line, index) in terminalLines"
                  :key="index"
                  class="terminal-line"
                >
                  <span class="text-neutral-600">[</span>
                  <span class="text-success-500">  OK  </span>
                  <span class="text-neutral-600">]</span>
                  <span class="text-neutral-300 ml-2">{{ line }}</span>
                </div>

                <!-- Current Step (if loading) -->
                <div
                  v-if="currentStepText && !displayComplete && !error"
                  class="terminal-line"
                >
                  <span class="text-neutral-600">[</span>
                  <span class="text-warning-400 animate-pulse">  ..  </span>
                  <span class="text-neutral-600">]</span>
                  <span class="text-neutral-400 ml-2">{{ currentStepText }}</span>
                </div>

                <!-- Error Display -->
                <div
                  v-if="error"
                  class="terminal-line mt-2"
                >
                  <span class="text-neutral-600">[</span>
                  <span class="text-error-500">FAILED</span>
                  <span class="text-neutral-600">]</span>
                  <span class="text-error-400 ml-2">{{ error }}</span>
                </div>
              </div>

              <!-- Ready Message -->
              <div
                v-if="displayComplete && !error"
                class="mt-6"
              >
                <div class="text-success-500 mb-3">
                  {{ t('loading.boot-complete') }}
                </div>
                <div
                  data-testid="loading-ready"
                  class="text-primary-400 animate-pulse flex items-center"
                >
                  <span>{{ t('loading.press-any-key') }}</span>
                  <span
                    v-if="showCursor"
                    class="ml-1 w-2 h-4 bg-primary-400 inline-block"
                  />
                  <span
                    v-else
                    class="ml-1 w-2 h-4 inline-block"
                  />
                </div>
              </div>

              <!-- Error Retry -->
              <div
                v-if="error"
                class="mt-4"
              >
                <button
                  class="text-primary-400 hover:text-primary-300 underline font-mono"
                  @click="$emit('retry')"
                >
                  > {{ t('loading.retry-command') }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scanlines {
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.1),
    rgba(0, 0, 0, 0.1) 1px,
    transparent 1px,
    transparent 2px
  );
}

.terminal-line {
  font-family: 'Courier New', Courier, monospace;
  letter-spacing: 0.02em;
}
</style>

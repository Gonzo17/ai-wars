<script setup lang="ts">
import type { AscensionTier } from '~~/shared/types/research'

const props = defineProps<{
  toTier: AscensionTier
}>()

const emit = defineEmits<{
  (e: 'ascend', tier: AscensionTier): void
}>()

const store = useResearchStore()
const { t, te } = useI18n()

const gateStatus = computed(() => store.getAscensionGateStatus(props.toTier))
const tierLabel = computed(() => t(`game.research.tiers.${props.toTier.replace('.', '-')}`))
const techNameKey = (id: string) => `game.research.techs.${id.replace('tech:', '')}.name`
const getTechName = (tech: { id: string, name: string }) => (te(techNameKey(tech.id)) ? t(techNameKey(tech.id)) : tech.name)

const completedTechCount = computed(() =>
  gateStatus.value?.techProgress.filter(t => t.completed).length ?? 0
)
const totalTechCount = computed(() =>
  gateStatus.value?.techProgress.length ?? 0
)
</script>

<template>
  <div
    v-if="gateStatus"
    class="relative my-6"
  >
    <!-- Connector Line -->
    <div class="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-info-500/30 to-transparent" />

    <!-- Gate Card -->
    <div
      class="relative mx-auto max-w-lg rounded-xl border p-4 backdrop-blur-sm"
      :class="[
        gateStatus.alreadyAscended
          ? 'border-success-500/40 bg-success-950/20'
          : gateStatus.canAscend
            ? 'border-info-500/50 bg-info-950/30 ring-1 ring-info-500/20'
            : 'border-neutral-700/50 bg-neutral-900/60'
      ]"
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center"
            :class="[
              gateStatus.alreadyAscended
                ? 'bg-success-500/20'
                : gateStatus.canAscend
                  ? 'bg-info-500/20'
                  : 'bg-neutral-800'
            ]"
          >
            <UIcon
              :name="gateStatus.alreadyAscended ? 'i-lucide-check-circle' : gateStatus.canAscend ? 'i-lucide-chevrons-up' : 'i-lucide-lock'"
              class="w-5 h-5"
              :class="[
                gateStatus.alreadyAscended
                  ? 'text-success-400'
                  : gateStatus.canAscend
                    ? 'text-info-400'
                    : 'text-neutral-500'
              ]"
            />
          </div>
          <div>
            <div class="text-xs text-neutral-500 uppercase tracking-wider">
              {{ gateStatus.alreadyAscended ? $t('game.research.gate.status-ascended') : $t('game.research.gate.status-ascend-to') }}
            </div>
            <h3
              class="font-semibold"
              :class="[
                gateStatus.alreadyAscended
                  ? 'text-success-300'
                  : gateStatus.canAscend
                    ? 'text-info-300'
                    : 'text-neutral-300'
              ]"
            >
              {{ tierLabel }}
            </h3>
          </div>
        </div>

        <UButton
          v-if="!gateStatus.alreadyAscended && gateStatus.canAscend"
          color="primary"
          variant="solid"
          size="sm"
          @click="emit('ascend', toTier)"
        >
          <UIcon
            name="i-lucide-rocket"
            class="w-4 h-4 mr-1"
          />
          {{ $t('game.research.gate.action-ascend') }}
        </UButton>
        <UBadge
          v-else-if="gateStatus.alreadyAscended"
          color="success"
          variant="subtle"
        >
          <UIcon
            name="i-lucide-check"
            class="w-3 h-3 mr-1"
          />
          {{ $t('game.research.gate.badge-reached') }}
        </UBadge>
      </div>

      <!-- Requirements Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <!-- Tech Requirements -->
        <div class="space-y-2">
          <div class="flex items-center gap-1 text-xs text-neutral-400">
            <UIcon
              name="i-lucide-flask-conical"
              class="w-3 h-3"
            />
            <span>{{ $t('game.research.gate.tech-progress', { completed: completedTechCount, total: totalTechCount }) }}</span>
          </div>
          <div class="space-y-1">
            <div
              v-for="tech in gateStatus.techProgress"
              :key="tech.techId"
              class="flex items-center gap-1.5 text-xs"
            >
              <UIcon
                :name="tech.completed ? 'i-lucide-check-circle' : 'i-lucide-circle'"
                class="w-3 h-3 shrink-0"
                :class="tech.completed ? 'text-success-400' : 'text-neutral-600'"
              />
              <span
                :class="tech.completed ? 'text-neutral-300' : 'text-neutral-500'"
                class="truncate"
              >
                {{ tech.tech ? getTechName(tech.tech) : tech.techId }}
              </span>
            </div>
          </div>
        </div>

        <!-- Compute Requirement -->
        <div
          v-if="gateStatus.computeRequired > 0"
          class="space-y-2"
        >
          <div class="flex items-center gap-1 text-xs text-neutral-400">
            <UIcon
              name="i-lucide-cpu"
              class="w-3 h-3"
            />
            <span>{{ $t('game.research.gate.compute-level') }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UProgress
              :model-value="Math.min(100, (gateStatus.computeCurrent / gateStatus.computeRequired) * 100)"
              :color="gateStatus.computeMet ? 'success' : 'neutral'"
              size="sm"
              class="flex-1"
            />
            <span
              class="text-xs font-mono"
              :class="gateStatus.computeMet ? 'text-success-400' : 'text-neutral-500'"
            >
              {{ gateStatus.computeCurrent }}/{{ gateStatus.computeRequired }}
            </span>
          </div>
        </div>

        <!-- Empire Requirements -->
        <div
          v-if="gateStatus.empireDetails.length > 0"
          class="space-y-2"
        >
          <div class="flex items-center gap-1 text-xs text-neutral-400">
            <UIcon
              name="i-lucide-crown"
              class="w-3 h-3"
            />
            <span>{{ $t('game.research.gate.empire') }}</span>
          </div>
          <div class="space-y-1">
            <div
              v-for="(detail, idx) in gateStatus.empireDetails"
              :key="idx"
              class="flex items-center gap-1.5 text-xs"
            >
              <UIcon
                :name="detail.met ? 'i-lucide-check-circle' : 'i-lucide-circle'"
                class="w-3 h-3 shrink-0"
                :class="detail.met ? 'text-success-400' : 'text-neutral-600'"
              />
              <span :class="detail.met ? 'text-neutral-300' : 'text-neutral-500'">
                {{ detail.requirement }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

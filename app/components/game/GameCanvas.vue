<script setup lang="ts">
type PlanetSize = 'small' | 'medium' | 'large' | 'huge'

const props = defineProps<{
  viewMode: 'universe' | 'galaxy' | 'system' | 'planet'
  selectedType: 'planet' | 'army' | 'system' | 'galaxy' | 'research'
  selectedId: string
  planets: Array<{ id: string, name: string, location: { x: number, y: number }, systemId: string, size?: PlanetSize }>
  systems: Array<{ id: string, name: string, location: { x: number, y: number }, childCount: number }>
  galaxies: Array<{ id: string, name: string, location: { x: number, y: number }, childCount: number }>
}>()

const emit = defineEmits<{
  (e: 'select-planet' | 'select-system' | 'select-galaxy', id: string): void
  (e: 'update:view-mode', mode: 'universe' | 'galaxy' | 'system' | 'planet'): void
}>()

const { t } = useI18n()

// Asset sizing guidelines (source images):
// - Galaxy: 256–512px (recommended 512px)
// - System: 192–384px (recommended 384px)
// - Planet: 64–192px (recommended 192px, scaled by data size)
// - Sun: 192–256px (recommended 256px)

const nodeImages = {
  galaxy: '/background2.png',
  system: '/background1.png',
  planet: '/planet.png',
  sun: '/sun1.png'
} as const

const planetSizeMap: Record<PlanetSize, number> = {
  small: 56,
  medium: 76,
  large: 96,
  huge: 124
}

const sizeFromChildren = (childCount: number, base: number, max: number) => {
  const scaled = base + Math.sqrt(Math.max(childCount, 0)) * 18
  return Math.min(max, Math.round(scaled))
}

const pushAwayFromSun = (location: { x: number, y: number }, minDistance: number) => {
  const center = { x: 50, y: 50 }
  const dx = location.x - center.x
  const dy = location.y - center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist >= minDistance) return location
  const safeDist = dist === 0 ? minDistance : minDistance
  const scale = dist === 0 ? 0 : safeDist / dist
  return {
    x: center.x + (dist === 0 ? minDistance : dx * scale),
    y: center.y + (dist === 0 ? 0 : dy * scale)
  }
}

type MapNode = {
  id: string
  name: string
  type: 'galaxy' | 'system' | 'planet' | 'sun'
  location: { x: number, y: number }
  sizePx: number
  image: string
}

const nodes = computed<MapNode[]>(() => {
  if (props.viewMode === 'planet') {
    return []
  }

  if (props.viewMode === 'universe') {
    return props.galaxies.map(item => ({
      id: item.id,
      name: item.name,
      type: 'galaxy' as const,
      location: item.location,
      sizePx: sizeFromChildren(item.childCount, 180, 320),
      image: nodeImages.galaxy
    }))
  }

  if (props.viewMode === 'galaxy') {
    return props.systems.map(item => ({
      id: item.id,
      name: item.name,
      type: 'system' as const,
      location: item.location,
      sizePx: sizeFromChildren(item.childCount, 140, 240),
      image: nodeImages.system
    }))
  }

  const planetNodes = props.planets.map(item => ({
    id: item.id,
    name: item.name,
    type: 'planet' as const,
    location: pushAwayFromSun(item.location, 18),
    sizePx: planetSizeMap[item.size ?? 'medium'],
    image: nodeImages.planet
  }))

  const sunNode: MapNode = {
    id: 'sun',
    name: t('game.map.sun'),
    type: 'sun',
    location: { x: 50, y: 50 },
    sizePx: 180,
    image: nodeImages.sun
  }

  return [sunNode, ...planetNodes]
})

const nodeStyle = (node: MapNode) => ({
  left: `${node.location.x}%`,
  top: `${node.location.y}%`,
  width: `${node.sizePx}px`,
  height: `${node.sizePx}px`,
  backgroundImage: `url('${node.image}')`,
  transform: 'translate(-50%, -50%)'
})

const backgroundImage = computed(() => {
  if (props.viewMode === 'universe') return `url('/background1.png')`
  if (props.viewMode === 'galaxy') return `url('/background2.png')`
  return `url('/background1.png')`
})

const zoomState = ref<'idle' | 'in' | 'out'>('idle')
const previousViewMode = ref<'universe' | 'galaxy' | 'system' | 'planet'>(props.viewMode)

const depthOrder = {
  universe: 0,
  galaxy: 1,
  system: 2,
  planet: 3
} as const

watch(() => props.viewMode, (next) => {
  const previous = previousViewMode.value
  previousViewMode.value = next
  const direction = depthOrder[next] > depthOrder[previous] ? 'in' : 'out'
  zoomState.value = 'idle'
  requestAnimationFrame(() => {
    zoomState.value = direction
  })
})

const handleZoomEnd = () => {
  zoomState.value = 'idle'
}
</script>

<template>
  <div
    class="relative h-full min-h-[78vh] overflow-hidden border border-neutral-800 bg-center bg-cover shadow-2xl"
    :style="{ backgroundImage }"
  >
    <UButton
      v-if="viewMode === 'planet'"
      :color="'primary'"
      variant="ghost"
      size="md"
      :icon="'i-lucide-sparkles'"
      :label="$t('game.navigation.back-to-system')"
      class="relative z-10"
      @click="emit('update:view-mode', 'system')"
    />
    <UButton
      v-else-if="viewMode === 'system'"
      :color="'primary'"
      variant="ghost"
      size="md"
      :icon="'i-lucide-sparkles'"
      :label="$t('game.navigation.back-to-galaxy')"
      class="relative z-10"
      @click="emit('update:view-mode', 'galaxy')"
    />
    <UButton
      v-else-if="viewMode === 'galaxy'"
      :color="'primary'"
      variant="ghost"
      size="md"
      :icon="'i-lucide-sparkles'"
      :label="$t('game.navigation.back-to-universe')"
      class="relative z-10"
      @click="emit('update:view-mode', 'universe')"
    />

    <div
      class="relative z-10 h-full w-full"
      :class="{
        'zoom-in': zoomState === 'in',
        'zoom-out': zoomState === 'out'
      }"
      @animationend="handleZoomEnd"
    >
      <div class="pointer-events-none absolute inset-0">
        <div
          v-for="node in nodes"
          :key="node.id"
          :class="[
            'absolute bg-center bg-cover rounded-full',
            node.type === 'sun' ? 'pointer-events-none sun-glow' : 'pointer-events-auto'
          ]"
          :style="nodeStyle(node)"
        >
          <UButton
            v-if="node.type !== 'sun'"
            :color="node.type === 'system' || node.type === 'galaxy' ? 'primary' : 'secondary'"
            variant="ghost"
            size="xl"
            class="flex items-center justify-center rounded-full"
            :style="{ width: `${node.sizePx}px`, height: `${node.sizePx}px` }"
            @click="node.type === 'system'
              ? emit('select-system', node.id)
              : node.type === 'galaxy'
                ? emit('select-galaxy', node.id)
                : emit('select-planet', node.id)"
          >
            <span class="flex items-center gap-1">
              <span class="text-md text-black font-bold">{{ node.name }}</span>
            </span>
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.zoom-in {
  animation: zoomIn 1.2s cubic-bezier(.1,.8,.46,1);
}

.zoom-out {
  animation: zoomOut 1.2s cubic-bezier(.1,.8,.46,1);
}

.sun-glow {
  position: relative;
  overflow: visible;
  filter: drop-shadow(0 0 20px rgba(255, 210, 140, 0.35));
}

.sun-glow::after {
  content: '';
  position: absolute;
  inset: -80%;
  border-radius: 9999px;
  background: radial-gradient(
    circle,
    rgba(255, 248, 220, 0.8),
    rgba(255, 205, 130, 0.32) 22%,
    rgba(255, 160, 70, 0.14) 40%,
    rgba(255, 130, 50, 0.06) 55%,
    rgba(255, 120, 31, 0.02) 70%,
    rgba(255, 120, 31, 0) 86%
  );
  filter: blur(18px);
  opacity: 0.9;
  pointer-events: none;
}

@keyframes zoomIn {
  0% {
    transform: scale(0.5);
    opacity: 0.55;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes zoomOut {
  0% {
    transform: scale(5);
    opacity: 0.6;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>

<script setup lang="ts">
import { UNCLAIMED_COLOR } from '~~/shared/defs/playerColors'

type PlanetSize = 'small' | 'medium' | 'large' | 'huge'

const props = defineProps<{
  viewMode: 'universe' | 'galaxy' | 'system' | 'planet'
  selectedType: 'planet' | 'army' | 'system' | 'galaxy' | 'research'
  selectedId: string
  planets: Array<{ id: string, name: string, location: { x: number, y: number }, systemId: string, size?: PlanetSize, type?: string }>
  systems: Array<{ id: string, name: string, location: { x: number, y: number }, childCount: number }>
  galaxies: Array<{ id: string, name: string, location: { x: number, y: number }, childCount: number }>
  ownedIds?: string[]
  colorById?: Record<string, string>
  /** Real star id of the viewed system, so the central sun carries an ownership ring. */
  starId?: string
}>()

const ownedSet = computed(() => new Set(props.ownedIds ?? []))

// Ring encodes ownership: planets and the (buildable) sun always get one — grey
// if unclaimed; the viewer's own holdings get a thicker, brighter ring. Unowned
// systems/galaxies get a subtle neutral ring + soft inner edge so the circular
// crop blends into the backdrop.
const ringStyle = (node: MapNode): Record<string, string> => {
  const color = props.colorById?.[node.id]
  if (color) {
    return ownedSet.value.has(node.id)
      ? { boxShadow: `0 0 0 3px ${color}, 0 0 24px ${color}aa` }
      : { boxShadow: `0 0 0 2px ${color}, 0 0 12px ${color}66` }
  }
  if (node.type === 'planet' || node.type === 'sun') {
    return { boxShadow: `0 0 0 2px ${UNCLAIMED_COLOR}, 0 0 10px ${UNCLAIMED_COLOR}55` }
  }
  // Unowned system / galaxy
  return { boxShadow: '0 0 0 2px rgba(255,255,255,0.35), 0 0 16px rgba(0,0,0,0.5), inset 0 0 30px rgba(0,0,0,0.55)' }
}

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

// Real imagery (NASA + telescope photography, see docs/CREDITS.md).
const GALAXY_VARIANTS = 6
const SYSTEM_VARIANTS = 6
const KNOWN_PLANET_TYPES = new Set(['terrestrial', 'gas-giant', 'ice-giant', 'barren', 'oceanic', 'desert'])

// Stable per-id pick so a given galaxy/system always shows the same image.
const hashId = (id: string) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}
const planetImage = (type?: string) => `/planets/${type && KNOWN_PLANET_TYPES.has(type) ? type : 'terrestrial'}.webp`
const galaxyImage = (id: string) => `/galaxies/${hashId(id) % GALAXY_VARIANTS}.webp`
const systemImage = (id: string) => `/systems/${hashId(id) % SYSTEM_VARIANTS}.webp`
const sunImage = '/sun.webp'

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
      image: galaxyImage(item.id)
    }))
  }

  if (props.viewMode === 'galaxy') {
    return props.systems.map(item => ({
      id: item.id,
      name: item.name,
      type: 'system' as const,
      location: item.location,
      sizePx: sizeFromChildren(item.childCount, 140, 240),
      image: systemImage(item.id)
    }))
  }

  const planetNodes = props.planets.map(item => ({
    id: item.id,
    name: item.name,
    type: 'planet' as const,
    location: pushAwayFromSun(item.location, 18),
    sizePx: planetSizeMap[item.size ?? 'medium'],
    image: planetImage(item.type)
  }))

  const sunNode: MapNode = {
    id: props.starId ?? 'sun',
    name: t('game.map.sun'),
    type: 'sun',
    location: { x: 50, y: 50 },
    sizePx: 180,
    image: sunImage
  }

  return [sunNode, ...planetNodes]
})

const nodeStyle = (node: MapNode) => ({
  left: `${node.location.x}%`,
  top: `${node.location.y}%`,
  width: `${node.sizePx}px`,
  height: `${node.sizePx}px`,
  backgroundImage: `url('${node.image}')`,
  // Planet/sun art has dark margins around the disk; overfill the circular crop so the
  // disk meets the ownership ring with no gap (matches the planet view's scale-110).
  backgroundSize: node.type === 'planet' || node.type === 'sun' ? '116%' : 'cover',
  transform: 'translate(-50%, -50%)'
})

const backgroundImage = computed(() => {
  if (props.viewMode === 'universe') return `url('/space/universe.webp')`
  if (props.viewMode === 'galaxy') return `url('/space/galaxy.webp')`
  // system + planet share the system backdrop.
  return `url('/space/system.webp')`
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
      data-testid="map-back"
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
      data-testid="map-back"
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
      data-testid="map-back"
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
            'absolute bg-center bg-cover rounded-full pointer-events-auto',
            node.type === 'sun' ? 'sun-glow' : ''
          ]"
          :data-testid="`map-node-${node.id}`"
          :data-owned="ownedSet.has(node.id) ? 'true' : undefined"
          :style="[nodeStyle(node), ringStyle(node)]"
        >
          <!-- Name label above the node (ownership is shown by the ring colour).
               Hidden for the sun so the central glow stays clean. -->
          <div
            v-if="node.type !== 'sun'"
            class="absolute -top-2 left-1/2 z-20 -translate-x-1/2 -translate-y-full rounded-full bg-neutral-950/85 px-2 py-0.5 text-[11px] font-semibold text-white shadow-lg whitespace-nowrap pointer-events-none ring-1 ring-white/10"
          >
            {{ node.name }}
          </div>
          <button
            type="button"
            :aria-label="node.name"
            class="relative z-10 h-full w-full rounded-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            @click="node.type === 'system'
              ? emit('select-system', node.id)
              : node.type === 'galaxy'
                ? emit('select-galaxy', node.id)
                : emit('select-planet', node.id)"
          />
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

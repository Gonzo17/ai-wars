<script setup lang="ts">
const props = defineProps<{
  viewMode: 'galaxy' | 'system'
  selectedType: 'planet' | 'army' | 'system' | 'research'
  selectedId: string
  planets: Array<{ id: string, name: string, location: { x: number, y: number }, systemId: string }>
  systems: Array<{ id: string, name: string, location: { x: number, y: number } }>
}>()

const emit = defineEmits<{
  (e: 'select-planet' | 'select-system', id: string): void
  (e: 'update:view-mode', mode: 'galaxy' | 'system'): void
}>()

const nodes = computed(() => {
  if (props.viewMode === 'galaxy') {
    return props.systems.map(item => ({ ...item, type: 'system' as const }))
  }
  return props.planets.map(item => ({ ...item, type: 'planet' as const }))
})

const canvas = useTemplateRef('canvas')

type Star = { x: number, y: number, r: number, a: number }

const mulberry32 = (seed: number) => {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

let ro: ResizeObserver | null = null
let stars: Star[] = []
let lastW = 0
let lastH = 0

const buildStars = (w: number, h: number) => {
  const rng = mulberry32(2040)
  const density = 0.00012
  const count = Math.max(120, Math.floor(w * h * density))
  stars = Array.from({ length: count }, () => {
    const x = rng() * w
    const y = rng() * h
    const r = 0.4 + rng() * 1.6
    const a = 0.08 + rng() * 0.45
    return { x, y, r, a }
  })
}

const draw = () => {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  if (!ctx) return

  const parent = el.parentElement
  if (!parent) return

  const cssW = Math.max(1, parent.clientWidth)
  const cssH = Math.max(1, parent.clientHeight)
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  const pxW = Math.floor(cssW * dpr)
  const pxH = Math.floor(cssH * dpr)

  if (el.width !== pxW || el.height !== pxH) {
    el.width = pxW
    el.height = pxH
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  if (cssW !== lastW || cssH !== lastH) {
    lastW = cssW
    lastH = cssH
    buildStars(cssW, cssH)
  }

  ctx.clearRect(0, 0, cssW, cssH)

  const bg = ctx.createRadialGradient(cssW * 0.55, cssH * 0.45, 0, cssW * 0.55, cssH * 0.45, Math.max(cssW, cssH))
  bg.addColorStop(0, 'rgba(2, 6, 23, 0.0)')
  bg.addColorStop(1, 'rgba(2, 6, 23, 0.85)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, cssW, cssH)

  for (const s of stars) {
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(226,232,240,${s.a})`
    ctx.fill()
  }

  const haze1 = ctx.createRadialGradient(cssW * 0.2, cssH * 0.3, 0, cssW * 0.2, cssH * 0.3, Math.max(cssW, cssH) * 0.6)
  haze1.addColorStop(0, 'rgba(56,189,248,0.10)')
  haze1.addColorStop(1, 'rgba(56,189,248,0.0)')
  ctx.fillStyle = haze1
  ctx.fillRect(0, 0, cssW, cssH)

  const haze2 = ctx.createRadialGradient(cssW * 0.8, cssH * 0.6, 0, cssW * 0.8, cssH * 0.6, Math.max(cssW, cssH) * 0.55)
  haze2.addColorStop(0, 'rgba(139,92,246,0.08)')
  haze2.addColorStop(1, 'rgba(139,92,246,0.0)')
  ctx.fillStyle = haze2
  ctx.fillRect(0, 0, cssW, cssH)
}

onMounted(() => {
  const el = canvas.value
  const parent = el?.parentElement
  if (!el || !parent) return

  draw()

  ro = new ResizeObserver(() => draw())
  ro.observe(parent)

  const onResize = () => draw()
  window.addEventListener('resize', onResize)

  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
  })
})

onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})
</script>

<template>
  <div class="relative h-full min-h-[78vh] overflow-hidden rounded-xl border border-slate-800 bg-linear-to-br from-slate-950 via-slate-900 to-black shadow-2xl">
    <UButton
      v-if="viewMode === 'system'"
      :color="'primary'"
      variant="ghost"
      size="md"
      :icon="'i-lucide-sparkles'"
      :label="$t('game.navigation.back-to-galaxy')"
      class="relative z-10"
      @click="emit('update:view-mode', 'galaxy')"
    />

    <canvas
      ref="canvas"
      class="absolute inset-0 h-full w-full opacity-30"
      aria-hidden="true"
    />

    <div class="relative z-10 h-full w-full">
      <div class="pointer-events-none absolute inset-0">
        <div
          v-for="node in nodes"
          :key="node.id"
          class="pointer-events-auto absolute bg-center bg-cover  "
          :style="{ left: `${node.location.x}%`, top: `${node.location.y}%`, backgroundImage: `url('/planet.png')` }"
        >
          <UButton
            :color="node.type === 'system' ? 'primary' : 'secondary'"
            variant="ghost"
            size="xl"
            class="h-40 w-40 rounded-full items-center justify-center"
            @click="node.type === 'system' ? emit('select-system', node.id) : emit('select-planet', node.id)"
          >
            <span class="flex items-center gap-1">
              <span
                class="text-md text-black font-bold"
              >{{ node.name }}</span>
            </span>
          </UButton>
        </div>
      </div>
    </div>
  </div>
</template>

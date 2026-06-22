# Phase 2 — Tech-tree rebuild (design spec)

Status: **checkpoint draft** (June 2026). Decisions locked with David:
- **Hybrid specialization**: branches are soft (all reachable, escalating cost so you pick
  a focus/order), but **1–2 mutually-exclusive doctrine forks per era** give real,
  permanent opportunity cost and per-game identity.
- **Resource model unchanged**: energy / minerals / rare + the two strategics
  (exotic-matter, antimatter). Fix is **timing** — rare & exotic accessible earlier,
  escalating costs at higher tiers. No new resource types this pass.

This doc is the artifact to argue with before the rewrite. Implementation follows in
stages (see bottom).

## 1. The core gap this fixes

Today a `TechDef` can only *unlock* (via `requirements.research` on a building/unit) or
*gate* an ascension. There is **no buff mechanism**, so a tech that unlocks something you
already own/can build is felt as nothing — the #1 playtest complaint. The rebuild adds a
typed **effects** layer so every tech is felt: it unlocks AND/OR buffs.

### `TechEffect` (new, on `TechDef.effects?: TechEffect[]`)

```ts
type TechEffect =
  | { kind: 'districtOutput'; district: DistrictType; resource: 'energy'|'minerals'|'research'|'production'; mult: number }  // +25% energy from energy districts
  | { kind: 'buildingOutput'; building: BuildingId; resource: ...; mult: number }                                            // a specific building
  | { kind: 'buildCost'; target: 'all'|DistrictType|'units'; mult: number }                                                  // -20% build cost
  | { kind: 'unitStat'; unit?: UnitId; stat: 'speed'|'attack'|'defense'; mult?: number; add?: number }                       // +1 fleet speed
  | { kind: 'ability'; flag: string }                                                                                        // 'colonize:barren', 'planet-cracker', 'survey:exotic'
```

- Unlocks stay where they are (`requirements.research` on the def) — no churn there.
- A `techBuffs(player)` aggregator sums completed-tech effects into multipliers, read by
  `slotOutput` / `economy` / movement / combat. Pure, testable, mirrors how synergies work.
- The research-tree UI shows each tech's effects (not just "Unlocks: X").

## 2. The five branches (identity)

| Branch | Identity | Typical effects |
|---|---|---|
| **energy_compute** | power + science; the stellar/Dyson spine | +energy & +research district output, compute-uplink scaling, Dyson/stellar megastructures |
| **economy_industry** | throughput; build speed; megastructure fabrication | +production/minerals, −build cost, orbital fabricators |
| **exploration_navigation** | reach + intel + strategic surveys | +fleet speed/range, sensors/fog, **reveals strategic deposits** |
| **colonization_planettypes** | which worlds you can take, terraforming | unlock planet types, +terrain modifiers, colony buffs |
| **military_defense** | ship combat, shields, fortress, planet-cracker | +unit attack/defense, shields, the planet-cracker ability |

## 3. Tier ladder — convergent climb to a star, then it fans out

Every player's near-term goal is **k2.0 = hold a star**: only on a captured star do the
stellar structures & units unlock, so **k0.6→k2.0 is a convergent on-ramp everyone climbs**
(the doctrine forks flavour *how* you get there, not *whether*). **From k2.0 it fans out** —
the band is wide, costs escalate, and you genuinely cannot research everything; you commit
to a win path. **k3.0 is not a research tier — it IS the win** (reached three ways, see §5b),
so it holds zero techs: reaching it means the game is over.

Every gate = the tier's techs **plus** an empire condition (research fused with expansion).
★ = mutually-exclusive doctrine fork (pick one, siblings lock for the game).

| Tier | # techs | Content | Gate to REACH it |
|---|---|---|---|
| **k0.6** Foundation | 3 | AI Core + Energy & Industry heads (each buffs) | — (start) |
| **k0.8** Automation | 4 | ★ **Mass Production** vs **Deep Research**; Probe; **rare (early)** | techs only (stays quick) |
| **k1.0** Dominion | 5 | Military emerges; **exotic survey (early)**; Colony Ship | + **1 colony beyond homeworld** |
| **k1.5** Hegemony | 7 | ★ **Expansionist** vs **Entrenchment**; Fabricators; Governor; DC III; **star-constructor** | + **control your whole home system** |
| **k2.0** Stellar Mastery | **10** | **Star structures & units unlock**; ★ **Dyson** vs **Matrioshka**; antimatter; band fans out | + **hold ≥1 star** ← universal goal |
| **k2.3** Interstellar | 6 | Deep path content: victory-wonder line, capstone, cross-galaxy, advanced military | + **galaxyStarFraction ≥ 0.5** (still holding a star) |
| **k3.0** Ascension | **0** | **The win** — no research; reached by a victory condition | see §5b |

~35 techs, all in k0.6–k2.3; back-loaded (front three tiers = 12, k2.0 alone = 10).

## 4. Resource timing (per the locked decision)

- Rare extractor unlock: **k1.0 → k0.8**. Exotic survey: pulled earlier. So rare/strategic
  aren't dead weight for half the game.
- **Escalating costs**: higher-tier buildings/units carry rising strategic/rare costs, so
  the late economy stays a real constraint without new resource types.

## 5. Gates & empire requirements — the research⇄expansion link

Every gate = **the tier's techs + an escalating empire condition**. You cannot tech your
way up the ladder; you must also expand/hold territory. The escalation:

| To reach | Empire condition (besides the tier's techs) |
|---|---|
| k0.8 | — (first ascension stays quick) |
| k1.0 | 1 colony beyond the homeworld |
| k1.5 | control your whole home **system** (`homeSystemMajority`) |
| **k2.0** | **`starsControlled ≥ 1`** — *hold a star* (the universal milestone) |
| k2.3 | `starsControlled ≥ 1` + `galaxyStarFraction ≥ 0.5` |
| k3.0 | = **victory**, not a research ascension (see §5b) |

- **Remove `planetsControlled`** from every gate and from `ai-governor-systems`.
- **Add `galaxyStarFraction`** to `EmpireRequirement` (own ≥X of your home galaxy's stars),
  computed alongside the existing star/Dyson empire state.
- Keep the stellar gates (`starsControlled`, `dysonStages`). The star-constructor unlocks
  at k1.5 so a star can be captured *before* k2.0 — that capture IS the k2.0 gate.

## 5b. k3.0 = the win — reached three ways, each fusing research with one axis

k3.0 isn't researched into; it's **achieved**. Any one of the three conditions ends the
game in your favour (subject to the existing hold-countdown). Each needs research *plus*
one other axis — none is reachable by teching alone:

- **Expansion** — `galaxyStarFraction ≥ 0.9` (*hold the galaxy*). **Research + expand.**
  (Cleanly replaces today's standalone Expansion predicate.)
- **Megastructure** — once you hold a star (k2.0), research the victory-wonder line **and
  build it to completion** (a Dyson- or Matrioshka-based "Temporal Ascension Engine").
  **Research + build.** Replaces the placeholder pure-research win — the capstone tech
  alone never wins; the *built* wonder does (so it can later be besieged/cracked).
- **Military** — research the military doctrine **and conquer**: hold every enemy
  homeworld. **Research + fight.** (Today's Military predicate, kept.)

## 6. Implementation stages (after this spec is agreed)

1. **Mechanism**: `TechEffect` type + `techBuffs()` aggregator wired into
   `slotOutput`/economy; `galaxyStarFraction` in `EmpireRequirement` + empire-state
   computation + gate eval; drop `planetsControlled` gates. Tests for buff application,
   the doctrine lock-out, and the new gate.
2. **Content**: rewrite `TECH_DEFS` (lean-front/thick-back tiers, branches, the 4 doctrine
   forks, effects, rebalanced costs, earlier rare/exotic) + doctrine-exclusivity
   (`doctrineGroup`, like the district `branchGroup`) + every-tier empire gate + i18n for
   every tech. The victory-wonder tech line + capstone.
3. **Victory rework**: `resolve/victory.ts` — Expansion win ties to the k3.0 gate
   (`galaxyStarFraction ≥ 0.9`); replace the placeholder research win with **Megastructure**
   (victory wonder *built*, not just teched); keep Military. Update predicates + tests.
4. **Wiring**: planet-type colonization gating via `ability` flags; research-tree UI shows
   effects + doctrine forks + the galaxyStarFraction gate; tests.

Each stage is its own commit; nothing half-built between them.

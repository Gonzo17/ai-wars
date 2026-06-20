# Ascension of AI — Product Vision

Captured from David's design notes (June 2026). This is the **why and what** of the game;
the prioritized **how/when** lives in the roadmap section of [CLAUDE.md](../CLAUDE.md).
When a feature decision conflicts with this document, surface the conflict instead of guessing.

## Inspirations

- **Civilization** — turn-based strategy that is *not* purely about war: tech tree,
  resources, open-task tracking, end-turn flow. This is the core loop template.
- **Browser strategy games** (Galaxywars, OGame, Die Stämme) — map and unit mechanics
  are an inspiration, **but not** their time model: no servers that run open for days
  or weeks.

## Format

- **Session length: ~1–2 hours** for the first full version. This bounds turn count,
  tech-tree pacing and economy curves.
- **Multiplayer only, no bot players.** Scripted opponents are at most a *development
  tool* (playtesting), never part of the product.
- **Simultaneous turns** (already implemented): everyone plans, then the server resolves.

## Theme

The rise of AI — players are competing AI systems ascending the **Kardashev scale**.
The tech tiers (k0.6, k0.8, …) already reflect this; the scale is the narrative
backbone and should anchor progression: reaching a new civilization type is a
milestone that unlocks new research, buildings and capabilities.

## Hard rules

1. **No endless micromanagement.** Nothing in the design may require moving 20–50
   units per turn or babysitting dozens of build queues. Prefer few, meaningful
   decisions over many small ones.
2. **Browser-native, no game engine.** Plain Vue/DOM/CSS with images. (Settled
   decision — do not re-litigate.)
3. **Map is stylized, objects are real.** Distances, scale and movement are game
   abstractions, but celestial objects use real imagery — NASA photos and David's
   own pool of telescope material (a friend shoots with an auto-tracking telescope).
   Units can be symbols/icons until dedicated art exists.

## Map

Three zoom levels: **Universe → Galaxy → Solar system.** These are *views* into
**one single graph**, not three separate mechanics — see *Navigation & combat*
below. Atmosphere comes from real space imagery in backgrounds and map objects.
The top two levels should be laid out to reflect the **actual topology** (what is
near vs. far, which nodes are adjacent), not arbitrary circles side by side.

## Navigation & combat (refined June 2026)

**The whole universe is one weighted graph.** Movement is *never* free — always
**node-to-node along defined lanes**, on every level. Galaxies and systems are
**sub-regions/clusters** of that single graph that you zoom in and out of; the
three map levels are views, not separate movement systems. Today only the
inter-system level is a real graph in code — this generalises it to all three.

- **Nodes & gateways.** Leaf nodes are planets and stars. A system is a cluster of
  leaf nodes plus **defined access points (entry/exit gateway nodes)** that link to
  neighbouring systems; galaxies cluster systems the same way. You leave or enter a
  region only through its gateways → **choke-points matter**.
- **Distances & speed.** Every lane has a **fixed distance**; edges *within* a
  system are short, *between* systems longer, *between* galaxies longest. Units have
  a **speed**; travel time = distance / speed, **rounded up** (2.1 → 3 turns).
  Movement is **upgradable** (non-linear improvements), not just "one lane / turn".
- **Combat happens on the lane (edge-granular).** A unit travelling A→B that meets
  an enemy fights **on the edge**, which **blocks that lane** until resolved. Units
  in transit are drawn on the map (vision permitting). Combat **pins** units: while
  fighting they cannot continue to their destination — only keep fighting or
  **retreat back where they came from**.
- **Round-based resolution with player agency.** Each unit has an **attack** and a
  **defence** value, optionally **abilities**. A battle runs over **multiple
  rounds**: both sides strike each round, deal and take damage; after each round the
  player sees the result and **decides to keep fighting or flee**. Fleeing succeeds
  with a **probability** that abilities modify (e.g. *Guerilla = 100 % escape*).
  Several units can join one battle. Depth comes from **abilities, not mass**.
- **Optional weapon systems** tied to **mined resources** (damage types / armour
  penetration) are a later lever — details deliberately open.

This **replaces the earlier "defence stays at system granularity"** idea (a
stationed fleet defending a whole system): defence is now about holding gateways and
intercepting on lanes, not area coverage. Megastructures are still only *damaged* by
raids (stages knocked offline, repairable), never instantly destroyed — except by
the planet-cracker / victory wonder, where destructibility is the counterplay.

## Known weak spots (design debt, as of June 2026)

These are the areas David explicitly flags as "not strategically interesting yet":

- **Planet building.** Slots are few, buffs are binary (there or not), slots have
  no terrain types, and there is little room for synergies. Placement should
  *matter*. Direction: per-slot terrain attributes, richer resource nodes,
  adjacency interactions worth planning around — depth without adding busywork.
- **Unit movement & combat.** *(Direction now settled — see Navigation & combat
  below.)* Pure planet-to-planet travel made combat flat: whoever has more
  units/upgrades wins. The fix is the unified node graph + round-based combat
  (interception on lanes, flee decisions, abilities) — tactical depth without
  per-unit micromanagement. Fleets as stacks, few meaningful orders.
- **Tech tree.** The skeleton (Kardashev tiers + ascension gates) is right, the
  content is not mature. Ideas under consideration: civilization-type milestones
  unlocking whole capability classes, specialization points, repeatable research
  to deepen a buff. Techs must gate real unlocks (roadmap item 1).

## Progression spine: stars drive advancement (refined June 2026)

The backbone that ties the tech tree, planets and stars together: **controlling
stars is how you advance.** Thematically Kardashev — more stars = more energy =
higher civilization type = new research, buildings and units. This makes the map
matter from the first turns (you *must* take stars to progress), independent of
the endgame.

**Taking a star is a second kind of colonisation.** A planet gets a *surface*
base; a **star** gets an orbital **Dyson scaffold**, built by a dedicated *star
constructor* unit under space superiority (the unit is consumed, like the colony
ship). The scaffold *is* the capture and gives you a base. A star base shares the
planet machinery (owner, slots, production, workers/robots, build queue, combat,
fog) but has its own **megastructure catalogue**: Dyson swarm stages (energy),
Matryoshka brain (research boost), orbital shipyard, orbital defence. Planet and
star control in a system stay separate — space control (fleet combat) decides who
may build at / damage the star.

**Players start with a single planet** — a terrestrial **homeworld** (always
Earth-like). Every system also holds one planet of each other type as unclaimed
settling targets; which to take is strategic. The homeworld is flagged
(`Planet.isHomeworld`) and anchors the military victory.

## Kardashev ladder (refined June 2026)

The scale tops out at **Type 3 — there is no Type 4.** "Beyond the galaxy" would
be "the whole universe", which in this game is just *all galaxies* = the military
win, not a power tier. What lies past Type 3 is therefore not a higher *number*
but three *kinds* of transcendence (the three victories).

| Band | Gate | Role |
|---|---|---|
| 0.6 → 1.0 (planetary) | research / compute only | short on-ramp: base economy, first fleet, expansion |
| → 2.0 (stellar leap) | **1 star + Dyson Sphere** | the one hard planetary→stellar gate |
| 2.0 → 2.x (stellar era) | research / compute / Dyson stages (one star suffices) | **the main playing field; shared late-game base where all three victory lines unlock** — never gated by *more* stars, so a "tall" single-star player misses nothing |
| → 3.0 (galactic) | **majority (~90%) of the galaxy's stars**, held | = **Expansion victory**; the finish line, not a research tier |

So depth belongs in the **2.x band**, not (as today) crammed between 0.6 and 2.0:
short on-ramp, stretched stellar era. Extend `EmpireRequirement` with star fields
(`starsControlled`, `dysonStages`, `galaxyStarFraction`);
`AscensionGateDef.requiresEmpire` stays the mechanism.

## Three victory conditions — three verbs (refined June 2026)

A shared shape: **condition met → visible countdown → hold / finish to win.** They
differ in trigger and counter. The mystery lives in the *approach*; the imminent
win is always telegraphed (multiplayer fairness). All three branch from the shared
Type-2.x research base.

| Path | Trigger | Notification | Counter-shape |
|---|---|---|---|
| **Expansion** (wide) | ascend to Type 3: hold a majority (~90%) of galaxy stars for K turns | vague "approaching" early → hard visible countdown once qualified | peel a system off (many locations) |
| **Research** (tall) | **Temporal Ascension** capstone — transcend causality, *step off* the energy ladder; reachable tall from the 2.x base, no wide territory needed (underdog / comeback path) | globally announced completion countdown (build time) | destroy the structure (one location) |
| **Military** (eliminate) | capture **all enemy homeworlds** + a moderate star/planet threshold (far below "take everything"), hold K turns | intel on the threat | retake a homeworld |

**Research fiction:** the AI ascends *out of* the timeline (a-temporal), so the
grandfather paradox is irrelevant — it just ends on a win.

**Planet-cracker** — the late-game mega-unit (Death Star-like): expensive, slow,
*mobile*. It **destroys planets *and* stars** (objects become destructible). It is
both (a) the siege tool that makes the military path viable against fortified
worlds and (b) a **brutal direct win**: destroy enough planets/stars and you win —
possible *only* with this one unit, and the enemy is **warned** (construction
intel + a strike telegraph, location fogged until it hits). It also doubles as the
universal disruptor of the two peaceful wins (crack the lynchpin) — but
*conventional* fleets must also be able to damage a wonder, so military is never
*mandatory* to stop a win.

**Defense is gateway / lane based** (refined June 2026 — this supersedes the earlier
"fleet defends the whole system" model; see *Navigation & combat*). You hold a
region by controlling its access points and intercepting transiting fleets on lanes;
optional stationary orbital-defence buildings sit at gateways as an alternative. No
separate guard micromanagement. Megastructures are *damaged* by raids (stages knocked
offline, repairable), never instantly destroyed — except by the planet-cracker / the
victory wonder, where destructibility is the counterplay.

**Kardashev tiers are game abstractions, not astronomy.** A "galaxy" is a cluster
of ~5–8 systems. Each player starts in their own home galaxy (Civ-continents
pattern) with a contested neutral region between them. Ascension gates use
*threshold* requirements — never "own every star", to avoid
denial-by-hidden-outpost endgames.

Dyson swarm is **economy infrastructure, not a victory trigger** —
non-exclusive and staged (every player can build their own, per star, in
stages); some *expansions/extensions* of it may be exclusive. It fuels whichever
path the player is pursuing.

**Open points to pin when building the endgame:** whether the planet-cracker's
"brutal destroy" is a *separate* military path or the same condition expressed by
destruction; whether "starting planet" stays exactly one homeworld; the exact
star/planet thresholds and hold durations.

**Pacing target: ~80–120 turns ≈ 1–2h.** Simultaneous turns are short —
median ~30s (one build queue per planet, one research, few fleet stacks),
with occasional late-game spikes of minutes. No hard turn limit. Implications:
build times of 2–4 turns, research 5–12 turns, lane travel 2–4 turns, Dyson
stages and the wonder countdown ~10–15 turns each are all acceptable at this
turn count. Empty "just end turn" turns are fine as long as they are
frictionless. Future lever (not v1): optional soft turn timer as a lobby
setting, since the slowest player drives session length.

## UI

Kept deliberately simple: Civ-like chrome (top bar resources, tech tree overlay,
end-turn button with open-task states), space mood via imagery, no heavy animation
work before gameplay depth exists.

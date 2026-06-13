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

Three zoom levels: **Universe → Galaxy → Solar system.** Travel happens on the
star-lane graph between systems. Atmosphere comes from real space imagery in
backgrounds and map objects.

## Known weak spots (design debt, as of June 2026)

These are the areas David explicitly flags as "not strategically interesting yet":

- **Planet building.** Slots are few, buffs are binary (there or not), slots have
  no terrain types, and there is little room for synergies. Placement should
  *matter*. Direction: per-slot terrain attributes, richer resource nodes,
  adjacency interactions worth planning around — depth without adding busywork.
- **Unit movement & combat.** Pure planet-to-planet travel makes combat flat:
  whoever has more units/upgrades wins. There must be *some* tactical element
  (positioning, chokepoints, interception on lanes, stances) — but never per-unit
  micromanagement. Fleets as stacks, few meaningful orders.
- **Tech tree.** The skeleton (Kardashev tiers + ascension gates) is right, the
  content is not mature. Ideas under consideration: civilization-type milestones
  unlocking whole capability classes, specialization points, repeatable research
  to deepen a buff. Techs must gate real unlocks (roadmap item 1).

## Megastructures, stars & victory (refined June 2026)

**Stars become first-class map objects in the late game.** Each system has one
star as a build site for star-anchored megastructures (Dyson swarm stages,
later e.g. stellar engine). This gives the map a phase arc: planets matter
early (economy), lanes/chokepoints matter mid (position), stars matter late
(victory). Planet ownership and star control in the same system are separate —
an enemy colony can sit in a system whose star you are harvesting; space
control (fleet combat) decides who may build at or damage the star.

**Defense stays at system granularity.** A fleet stationed in a system defends
everything in it; optional stationary orbital-defense buildings as an
alternative. No separate guard micromanagement. Megastructures are *damaged*
by raids (stages knocked offline, repairable), never instantly destroyed —
except the victory wonder, where destructibility is the counterplay.

**Kardashev tiers are game abstractions, not astronomy.** A "galaxy" is a
cluster of ~5–8 systems. Each player starts in their own home galaxy
(Civ-continents pattern) with a contested neutral region between them.
Ascension gates use *threshold* empire requirements (e.g. majority of your
galaxy's stars, N Dyson stages, specific megastructure built) — never "own
every star", to avoid denial-by-hidden-outpost endgames. The existing
`AscensionGateDef.requiresEmpire` is the intended mechanism; extend
`EmpireRequirement` with star/megastructure fields when implementing.

**Three victory conditions, distinct by *type* not just ingredients (refined June 2026).**
The point is three different *verbs* — hold / build / eliminate — so none feels
like "build a wonder with different prerequisites". All three need a base of
late-game research, then diverge into expansion vs. research vs. military.

1. **Expansion — a *control* victory (hold a threshold).** Control ≥ N solar
   systems and hold them for K turns. Crossing the threshold (while the base
   prerequisites are met) starts a galaxy-wide, fully visible **dominance
   countdown**; opponents must take a system away to pause/reset it. This makes
   the sprawling empire the target everyone gangs up on — structurally
   different from defending a build site. Win trigger = a maintained *state*,
   not a finished object.
   - *"Control a system"* (pin down when implementing): own the star + planet
     majority + no contesting enemy fleet. Ties to system-granular control and
     "stars as build sites" above.
2. **Research — a *completion* victory (Temporal Ascension).** Build the
   time-travel capstone: thematically a *different* ascension — transcending
   causality, not scale/energy. Requires a deep tech line + an exotic resource,
   reachable "tall" without wide territory → the underdog / comeback path. The
   grandfather paradox is irrelevant to the game (it just ends on a win); the
   fiction hand-wave is that the AI ascends *out of* the timeline (a-temporal),
   so it doesn't erase its own origin. Completion = instant win.
3. **Military — an *elimination* victory.** Eliminate all opponents. Enabled
   late-game by a **planet-cracker mega-unit** (Death Star-like): expensive,
   slow, *mobile*, destroys enemy planets so domination doesn't stall against
   well-defended worlds. Deliberately asymmetric: you build the *weapon*, then
   *use* it — not "build → win". Military must require actually fighting.

**Every path telegraphs before it wins — no no-warning snowball.** What differs
is the notification model and the counter-shape:

| Path | Win trigger | Notification | Counter-shape |
|---|---|---|---|
| Expansion | hold N systems for K turns | vague "approaching" early warning (you know territorial danger, *not* whether hidden conditions are met) → hard visible countdown once they qualify | peel a system off (many locations) |
| Research | finish the capstone | globally announced, visible completion countdown | destroy the structure (one location) |
| Military | eliminate opponents | intel on planet-cracker construction start + completion, but its location fogged until it strikes (cat-and-mouse) | hunt/destroy the mobile weapon, or out-defend |

The mystery lives in the *approach*; the actual imminent win is always clearly
telegraphed (multiplayer fairness). The planet-cracker doubles as the universal
disruptor of the two peaceful wins (crack the lynchpin planet) — but
*conventional* fleets must also be able to damage a wonder, so military is never
*mandatory* to stop a win.

Dyson swarm is **economy infrastructure, not a victory trigger** —
non-exclusive and staged (every player can build their own, per star, in
stages); some *expansions/extensions* of it may be exclusive. It fuels whichever
path the player is pursuing.

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

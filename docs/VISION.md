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

## Megastructures (mid/endgame)

Civ-style wonders are a must for the mid- and endgame. Open design area; current
thinking:

- **Dyson sphere** is the obvious one — but since every civilization eventually
  wants it, it may be *non-exclusive* (each player can build their own).
- Other megastructures may be *exclusive*, wonder-race style (first to finish).
- Likely the natural hook for the **victory condition**: an ascension project that
  ends the game fits the theme and bounds session length.

## UI

Kept deliberately simple: Civ-like chrome (top bar resources, tech tree overlay,
end-turn button with open-task states), space mood via imagery, no heavy animation
work before gameplay depth exists.

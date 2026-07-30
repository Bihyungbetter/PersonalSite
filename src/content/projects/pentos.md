---
title: Pentos
summary: A 5-axis 3D printer — a belt-driven tilt-rotate table adds U and V rotary axes to a conventional XYZ motion system, letting the part reorient under the nozzle mid-print.
date: 2026-07-29
tags: [cad, 3d-printing, motion, mechanism]
tools: [Onshape]
model: /models/pentos.glb
# Onshape STEP exports are Z-up; glTF is Y-up.
up: z
specs:
  - { label: Axes, value: "5 — XYZ plus U (tilt) and V (rotate)" }
  - { label: Rotary drive, value: "2 × LDO NEMA 17 47STH (48 mm), GT2 belt" }
  - { label: Shafting, value: "goBILDA 8mm REX, Sonic hubs, 1611 flanged bearings" }
  - { label: Bed, value: "Prusa Magnetic Heatbed Tile v3 on rotating buildplate" }
  - { label: Homing, value: "Magnet + sensor pair on each rotary axis" }
links: []

# Mates do not survive CAD export, so the kinematics are declared here and rebuilt
# in the viewer. Names come from `npm run convert`, which prints the assembly tree.
axes:
  - id: u
    label: U · cradle tilt
    # Trunnion axis: both 1611 bearings, both Sonic hubs and the 52 mm REX shaft
    # sit at y = 0.51, z = 84.19, spread along X.
    pivot: [0, 0.51, 84.19]
    axis: [1, 0, 0]
    range: [-90, 90]
    start: 0
    # Everything swings with the cradle except the fixed frame and the U drive
    # that pushes against it.
    include: ["*"]
    exclude:
      - Y-Gantry
      - U-Axis Holder
      - U-Axis Holder Back
      - Sensor
      - Gates_2GT_20T_Toothed_Pulley
      - "LDO Nema_17_47STH (hhe 48 mm) v4 #2"
  - id: v
    label: V · bed rotation
    parent: u
    # Vertical shaft at x = -5.19, y ≈ 1.99 (mean of the bearing races and shaft).
    pivot: [-5.19, 1.99, 45.71]
    axis: [0, 0, 1]
    range: [-180, 180]
    start: 0
    include:
      - "V-Axis Bed <1>"
      - "2mm Pitch GT2 Pinion*"
---

## Overview

<!-- TODO: replace with your own writeup — this was drafted from the CAD assembly's part list. -->

Pentos is a 5-axis 3D printer. On top of the usual three linear axes it adds a
tilt-rotate table: a **U** axis that swings the cradle through an arc, and a **V**
axis that spins the buildplate inside it. Because the part can reorient itself under
the nozzle, layers no longer have to stack along a single global Z — overhangs can be
rolled upright instead of supported, and deposition can follow a curved surface rather
than stair-stepping across it.

The assembly modeled here is the motion end of the machine: the Y gantry, the U-axis
holder and cradle that carry the trunnion, and the V-axis base and bed that make up
the rotating platter. **The viewer above is live** — the U and V sliders drive the
real joints, so you can tilt the cradle and spin the bed the way the machine does.

## Design notes

- The tilt axis runs right through the build surface at z ≈ 84 mm rather than below
  it, which keeps the part near the centre of rotation and holds the swept envelope down
- Both rotary axes are driven by LDO NEMA 17 47STH steppers through Gates 2GT 20T
  pulleys. The U motor bolts to the fixed holder and drives the trunnion by belt; the
  V motor rides on the cradle so its belt geometry stays fixed as the cradle tilts
- Shafting is goBILDA 8mm REX throughout — Sonic hubs, e-clips, and 1611 flanged ball
  bearings (8 mm REX ID × 14 mm OD) — which keeps the rotary joints buildable from
  stock parts
- Where a stock bearing didn't fit the envelope, printed inner and outer races carry
  the load instead, the same approach used on the biped's roller feet
- A Prusa Magnetic Heatbed Tile v3 sits on the buildplate, so print surfaces stay
  swappable even though the bed is now a moving rotary axis
- Each rotary axis homes against a magnet-and-sensor pair rather than a mechanical
  endstop, which would otherwise have to survive being rotated past repeatedly

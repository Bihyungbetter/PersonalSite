---
title: FTC Competition Robot
summary: This season's FTC robot — two independent drivepods on an 8:1 helical reduction, a Limelight-guided shooter, and a spindexer feeding it, packed into the 18-inch sizing cube.
date: 2026-07-29
tags: [cad, robotics, ftc, drivetrain]
tools: [Onshape]
model: /models/ftc-drivetrain.glb
# Exported directly from Onshape as GLTF (not via STEP). Despite glTF's spec
# calling for Y-up, this export's bbox matches the STEP route's raw (Z-up) frame
# axis-for-axis, so Onshape's exporter keeps the native CAD orientation here too.
up: z
specs:
  - { label: Envelope, value: "441 × 431 × 404 mm (fits the 18 in sizing cube)" }
  - { label: Drive, value: "2 × goBILDA 5203 gearmotor drivepods" }
  - { label: Reduction, value: "Helical 4.625M 10T → 80T, 8:1" }
  - { label: Shafting, value: "goBILDA 2106 Series 8 mm REX, e-clips" }
  - { label: Wheels, value: "32 mm omni wheels + printed rollers on custom races" }
  - { label: Control, value: "REV Control Hub 31-1152, 12V slim battery, XT-30" }
  - { label: Vision, value: "Limelight 3A on a printed mount" }
  - { label: Scoring, value: "Flywheel shooter + spindexer, Axon Max servo" }
links: []
---

## Overview

<!-- TODO: replace with your own writeup — this was drafted from the CAD assembly's part list. -->

This is the full robot assembly for the season: a two-pod drivetrain, the structure that
ties it together, and the scoring mechanism that sits on top of it. Everything had to
fit inside FTC's 18-inch sizing cube, and the finished assembly measures 441 × 431 ×
404 mm — a little over an inch of margin in every direction, most of which went to
keeping the shooter's exit path clear.

The drivetrain is built as two mirrored **drivepods** rather than a single welded frame.
Each pod is a self-contained module — motor, reduction, shaft, wheel, encoder cover —
that bolts to the baseplate through channel, so a bent plate or a stripped gear is a
module swap rather than a teardown.

## Design notes

- Each pod runs a goBILDA 5203 gearmotor into a **helical 4.625M 10T → 80T pair**, an
  8:1 reduction. Helical teeth were worth the extra axial load here: the pods sit
  directly under the driver's hands during a push match, and spur gears at this ratio
  were audibly the loudest thing on last year's robot
- Power goes out over goBILDA **2106 Series 8 mm REX** stainless shafting with e-clip
  retention, which keeps the whole rotating group serviceable without a press
- Where a stock bearing wouldn't fit the envelope, printed **inner and outer races**
  (3×8 and 8×12) carry the load instead, backed by 4390N157 flanged ultra-thin ball
  bearings at the points that actually see a moment
- The 32 mm omni wheels are supplemented by a printed wheel core, adaptor, and roller
  set, so the contact patch could be tuned against the field tile without buying a new
  wheel every iteration
- Structure is goBILDA 1204 gusseted angle mounts and 1205/quad block mounts on channel,
  with a printed baseplate, slant plates, and diagonals taking the twist out of the frame
- Electronics are a **REV Control Hub (31-1152)** behind a printed cover plate, a 12V
  slim battery (31-1302) in a dedicated pack, and the 31-1387 switch bracket, all wired
  on XT-30
- A **Limelight 3A** on a printed mount does the aiming; the shooter is fed by a
  spindexer driven off an Axon Max servo, with the ramp and transfer gear staged so a
  jam clears by reversing rather than by reaching in

## What I'd change

- The spindexer mounting plate is already on its second revision and still the part I'd
  redo first — it wants to be one piece with the servo plate instead of two bolted
  together
- Several spacer lengths were left TBD in CAD and settled on the robot, which is fine
  once but painful when a plate changes thickness

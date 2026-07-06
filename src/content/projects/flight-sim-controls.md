---
title: Force-Feedback Flight Sim Controls
summary: A direct-drive force-feedback joystick gimbal using a GB54-2 gimbal motor, HTD timing belts, and helical gear reductions.
date: 2026-06-01
tags: [hardware, cad, flight-sim, force-feedback]
tools: [Fusion 360]
model: /models/flight-sim-controls.glb
poster: /posters/flight-sim-controls.webp
up: z
featured: true
specs:
  - { label: Motor, value: "GB54-2 gimbal motor" }
  - { label: Belt drive, value: "5mm HTD, 16T → 48T pulleys" }
  - { label: Gearing, value: "1.5M helical 15T/35T + 1.7M spiral bevel" }
  - { label: Hardware, value: "Heat-set inserts, REX shafts, steel bearings" }
links: []
---

## Overview

<!-- TODO: replace with your own writeup — this was drafted from the CAD assembly's part list. -->

A force-feedback flight simulator control base. Torque from a GB54-2 gimbal motor is
routed through a 16T→48T HTD timing-belt stage and helical/spiral-bevel gearing to
drive the stick axes, with 8mm REX shafts running in steel ball bearings.

## Design notes

- Belt reduction keeps the motor mass off the moving gimbal
- Spiral bevel set (1.7M, 45°) turns the drive through the second axis
- Printed structure with tapered heat-set inserts for serviceable fastening

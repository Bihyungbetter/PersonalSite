---
title: Exoskeleton
summary: A powered lower-limb exoskeleton — hip, knee, and waist joints driven by AK-series actuators, with a custom control and power distribution board.
date: 2026-07-28
tags: [hardware, electronics, pcb, robotics, exoskeleton]
tools: [SolidWorks, KiCad]
model: /models/exoskeleton-pcb.glb
# KiCad's GLB export is already Y-up and in meters, unlike its STEP export.
up: y
specs:
  - { label: Joints, value: "Hip, knee, waist" }
  - { label: Actuators, value: "CubeMars AK80-64, AK70-10" }
  - { label: Board, value: "114 x 135 mm, 45 components" }
  - { label: Power, value: "TO-220 regulation, radial electrolytics, axial power resistor" }
  - { label: I/O, value: "JST-GH and 2-pin headers, SPDT slide switch, status LEDs" }
links: []
---

## Overview

<!-- TODO: replace with your own writeup — this was drafted from the KiCad board's part list. -->

A powered lower-limb exoskeleton with actuated hip, knee, and waist joints. The
mechanical assembly is built around CubeMars quasi-direct-drive actuators — AK80-64
at the high-torque joints and AK70-10 where the reduction can be lighter.

The model shown here is the exoskeleton's custom control and power distribution
board, exported from KiCad with its copper, silkscreen, and soldermask layers
modeled. It carries 45 components across 19 resistors, 9 capacitors, 5 diodes,
3 ICs, 2 transistors, 6 connectors, and a slide switch.

## Design notes

- TO-220 vertical regulators and an axial power resistor handle the actuator-side supply
- JST-GH connectors for signal runs, 2-pin headers for power taps
- Mixed SMD and through-hole: 0805/1206 passives alongside DO-41 diodes and radial electrolytics
- Full ECAD/MCAD export, so the board drops straight into the mechanical assembly for clearance checks

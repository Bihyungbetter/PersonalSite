---
title: HackPad Macropad
summary: A custom mechanical macropad with its own PCB — MX switches, DSA keycaps, and a printed two-part case.
date: 2026-03-15
tags: [hardware, electronics, pcb, keyboards]
tools: [Fusion 360, KiCad]
model: /models/hackpad-macropad.glb
poster: /posters/hackpad-macropad.webp
up: z
featured: true
specs:
  - { label: Switches, value: "MX-style, plate mount" }
  - { label: Keycaps, value: "DSA profile 1u" }
  - { label: PCB, value: "Custom (silkscreen/copper/soldermask modeled)" }
  - { label: Case, value: "Printed bottom case + aligner" }
links: []
---

## Overview

<!-- TODO: replace with your own writeup — this was drafted from the CAD assembly's part list. -->

A compact macropad built around a custom PCB, with through-hole diodes, 0805/0603
passives, MX switch mounts, and a printed case fastened with button-head hex screws.

## Design notes

- Full ECAD/MCAD integration: the PCB model carries real silkscreen, copper, and soldermask layers
- DSA keycaps keep the profile uniform so the board works in any orientation

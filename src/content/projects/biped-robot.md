---
title: Biped Robot
summary: A bipedal walking robot with printed structure and goBILDA 8mm REX drive hardware, including custom roller-wheel feet.
date: 2026-01-20
tags: [cad, robotics, biped]
tools: [Onshape]
model: /models/biped-robot.glb
poster: /posters/biped-robot.webp
up: z
specs:
  - { label: Drive, value: "goBILDA 1311 Sonic Hub on 8mm REX shaft" }
  - { label: Rollers, value: "Printed, custom inner/outer races" }
  - { label: Structure, value: "Printed body + leg linkages" }
links: []
---

## Overview

<!-- TODO: replace with your own writeup — this was drafted from the CAD assembly's part list. -->

A bipedal robot with a printed central body and two legs. The drivetrain runs goBILDA
hardware — a 1311 Sonic hub on an 8mm REX shaft with an E-clip — and the feet use
printed rollers riding on custom inner/outer bearing races.

## Design notes

- Custom races let the rollers spin freely without off-the-shelf micro bearings
- Sonic hub interface keeps the drive components swappable

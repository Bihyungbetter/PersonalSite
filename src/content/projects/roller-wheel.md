---
title: Robotics Intake Mechanism
summary: A robot intake with a printed bucket, support arms, and a custom roller wheel built on goBILDA 8mm REX hardware.
date: 2026-01-20
tags: [cad, robotics, drivetrain]
tools: [Onshape]
model: /models/roller-wheel.glb
poster: /posters/roller-wheel.webp
specs:
  - { label: Shaft, value: "8mm REX, 40mm, E-clip retained" }
  - { label: Hub, value: "goBILDA 1311 Series Sonic Hub" }
  - { label: Rollers, value: "Printed, custom inner/outer races" }
links: []
---

## Overview

<!-- TODO: replace with your own writeup — this was drafted from the CAD assembly's part list. -->

A robot intake mechanism: a printed bucket carried on support arms, driven through a
custom roller wheel. The wheel base carries printed rollers on custom inner/outer
bearing races, mounted to a goBILDA Sonic hub on an 8mm REX shaft.

## Design notes

- Custom races let the rollers spin freely without off-the-shelf micro bearings
- Sonic hub interface keeps the wheel swappable across the drivetrain

---
title: Exoskeleton Frame
summary: The powered lower-limb exoskeleton's mechanical structure — bilateral hip abduction and hip/knee flexion joints built around CubeMars AK-series actuators.
date: 2026-07-29
tags: [hardware, robotics, exoskeleton, mechanism]
tools: [SolidWorks]
model: /models/exoskeleton-frame.glb
# SolidWorks' default front plane puts Y up, unlike Onshape's Z-up STEP exports.
up: y
specs:
  - { label: Joints, value: "Hip abduction, hip flexion, knee flexion — bilateral" }
  - { label: Actuators, value: "4x CubeMars AK80-64 (hip/knee flexion), 2x AK70-10 (hip abduction)" }
  - { label: Parts, value: "29-part mechanism: frames, step brackets, motor mounts" }
links: []
---

## Overview

<!-- TODO: replace with your own writeup — drafted from the converted assembly's part list. -->

The mechanical structure behind the [exoskeleton's control board](#p/exoskeleton):
a bilateral lower-limb frame with two actuated degrees of freedom at each hip —
abduction and flexion — plus a flexion joint at each knee. CubeMars quasi-direct-drive
actuators do the work directly, no separate gearbox stage: AK70-10 pancake motors
handle hip abduction, and AK80-64 motors handle the higher-torque hip and knee
flexion joints.

## Design notes

- Each hip is two nested joints: abduction rotates the whole leg assembly sideways
  from the waist mount, and flexion (nested inside it) swings the leg fore-aft
- Step-up/step-down bracket pairs at the hip and knee let the frame's effective
  length be adjusted in discrete steps rather than requiring a new part per size
- The knee is a single flexion joint, driven the same way as hip flexion — an
  AK80-64 mounted directly at the joint rather than through a linkage

---
title: "Dual VFD Display Board"
tagline: "A retro VFD desk display with full custom HV518 driver logic"
description: "A custom two-VFD-tube desk display combining retro VFD aesthetics with modern smart-home connectivity, fully custom PCB and assembly."
category: "Smart Home"
status: "Complete"
order: 8
heroImage: "/images/projects/vfd-display-board/hero.jpg"
gallery:
  - "/images/projects/vfd-display-board/1.jpg"
  - "/images/projects/vfd-display-board/2.jpg"
  - "/images/projects/vfd-display-board/3.jpg"
model: "/models/project/vfd-display-board/model.glb"
modelCaption: "VFD Display Board"
cameraOrbit: "0deg 40deg 120%"
---

A custom two-VFD-tube desk display combining retro VFD aesthetics with modern smart-home connectivity. Full custom PCB and assembly — black resin back, 8001 transparent front, with a USB-C port lined up on the back with more precision than I can really explain.

## Hardware

- ESP32-S3
- 2× VFD displays
- Boost converter for VFD high-voltage supply
- HV518 VFD driver + full custom ESP-to-HV518 bridging logic
- VEML7700 ambient light sensor
- AHT20 temperature/humidity sensor
- Buzzer
- USB-C charging port
- Custom enclosure: black resin back, 8001 transparent front

## Firmware

- Fetches time over WiFi
- Fetches live weather data
- Fetches live crypto prices
- Additional data modes

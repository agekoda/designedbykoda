---
title: "Power Puck"
tagline: "A magnetically mounted energy monitor, targeting ~6 months per charge"
description: "A low-power, magnetically mounted energy monitoring device, currently in development."
category: "Smart Home"
status: "Upcoming"
order: 12
heroImage: "/images/projects/smart-energy-meter-puck/hero.jpg"
gallery: []
---

A low-power, magnetically mounted energy monitoring device. Currently in development.

## Hardware

- ESP32-C3 Supermini + ATtiny1616
- Phototransistor for LED pulse detection
- 450mAh battery (target ~6 months life)
- TP4056 USB charging
- Magnetic alignment mounting system

## Design

- 35mm circular PCB
- CNC aluminium / resin mounting bracket

## Functionality

- Counts watt-hour LED pulses
- Periodic ESP wake + data transmission (ESP-NOW)
- Integration with Home Assistant / web dashboard

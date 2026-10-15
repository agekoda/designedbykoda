---
title: "Battery Profiler"
tagline: "A bench instrument that measures the real capacity of 1S Li-ion and LiPo cells"
description: "A single-cell bench instrument that measures the real capacity and health of Li-ion and LiPo batteries, built to check whether cheap cells live up to their advertised capacity."
category: "Measurement"
status: "Upcoming"
order: 13
heroImage: "/images/projects/battery-profiler/hero.jpg"
gallery: []
---

A single-cell bench instrument that measures the real capacity of 1S Li-ion and LiPo batteries, built to check whether cheap cells live up to their advertised capacity. One board tests one cell, and two boards can run side by side. Currently in development.

## Try it

A working simulation of the board. Connect a cell and a power source, press START, and watch the real firmware screens run the full test. Some of the cells are not what they claim to be.

<div id="bp-sim"></div>
<script src="/scripts/battery-sim.js" defer></script>

## How a test works

Set the charge current, discharge current and cutoff voltage on the board, then the test runs:

1. Discharge to the cutoff (about 3.0V) to clear the unknown starting state
2. Charge fully, with the current coulomb-counted
3. Discharge again, coulomb-counted, which gives the real capacity figure
4. Charge back to about 3.8V for storage

## Hardware

- ESP32-S3-WROOM-1U-N8 with external antenna
- BQ25601 I2C charger with JEITA temperature protection
- INA228 current/voltage monitor with a 0.05Ω Kelvin shunt and hardware charge accumulator
- Constant-current electronic load (MCP4725 DAC, MCP6002 op-amp, IRLZ44N) on a 50mm heatsink
- 320×240 ST7789 TFT + 5 buttons
- USB-C (about 1A) and bench-supply (up to 2A) power inputs
- JST-PH, bare pad and screw terminal battery connections

## Features

- Real capacity measured by coulomb counting, not estimated from voltage
- Adjustable charge current, discharge current and cutoff voltage
- Reports charge in, charge out, efficiency and duration
- Results saved on-device (SPIFFS)
- Reverse-polarity, fuse, thermal and current-limit protection
- WiFi planned

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

A single-battery bench instrument that measures the real capacity and health of 1S Li-ion and LiPo cells, mainly so you can check whether cheap batteries live up to their advertised capacity. One board tests one cell, and you can run two boards side by side. Currently in development.

## How a test works

You set the charge current, discharge current and cutoff voltage on the board. The test then runs this sequence:

1. Discharge to the cutoff (about 3.0V) to clear the unknown starting state.
2. Rest.
3. Charge fully, with the current coulomb-counted.
4. Rest.
5. Discharge again, coulomb-counted. This gives the real capacity figure.
6. Rest.
7. Charge back to about 3.8V for storage.

The results show charge in, charge out, efficiency and duration, and are saved to SPIFFS.

## Hardware

- **Controller:** ESP32-S3-WROOM-1U-N8 with an external antenna (WiFi is planned but not in the firmware yet)
- **Charger:** BQ25601, an I2C charger with programmable charge current and JEITA temperature protection through its TS pin
- **Sensing:** INA228 with a 0.05Ω Kelvin-sensed shunt. Its hardware accumulator counts charge continuously, so nothing is missed between firmware polls
- **Electronic load:** a constant-current sink built from an MCP4725 DAC, an MCP6002 op-amp, an IRLZ44N and a 0.33Ω sense resistor. The analog loop holds the set current as the battery sags, and the MOSFET absorbs the leftover voltage as heat on a 50mm heatsink
- **Display and controls:** 320×240 ST7789 TFT with five buttons (Start, Stop, Up, Down, Select)
- **Power:** USB-C (about 1A) and a bench-supply terminal (up to 2A), diode-OR'd onto one rail, with a TVS diode and an XC6220 3.3V LDO behind it
- **Battery connections:** JST-PH, bare pads and a screw terminal, all on the same net

## Protection

- N-channel reverse-polarity MOSFET on the battery's ground leg
- 3A/6A PTC fuse
- Two thermistors: one feeds the charger, the other is read by the ESP32
- Firmware-clamped current ceiling
- STOP is checked first on every loop

## Where it stands

- Boards are assembled
- The BQ25601 passes bring-up: I2C works, input power is detected, and it correctly refuses to charge until the battery thermistor is fitted
- The electronic load works, holding about 500mA stably with the heatsink staying warm rather than hot
- Open issue: at a 1A setpoint the current stalls at about 715mA. The leading suspect is the op-amp's output swing, not yet confirmed
- Still to fit: INA228, thermistors, screen and connectors
- Still to do: the full firmware test on real hardware, and WiFi

## Features

- Measures real capacity by coulomb counting, not by estimating from voltage
- Fully automatic charge, discharge and rest sequence
- Adjustable charge current, discharge current and cutoff voltage
- Two boards can run side by side
- Results saved on the device

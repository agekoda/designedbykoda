---
title: "Phantomware"
tagline: "A fully custom Flipper Zero alternative built around the ESP32-S3"
description: "A fully custom multi-tool device based on the ESP32-S3, designed for wireless analysis, signal interaction, and hardware experimentation."
category: "RF & Wireless"
status: "Complete"
order: 1
heroImage: "/images/projects/phantomware/hero.jpg"
gallery:
  - "/images/projects/phantomware/1.jpg"
  - "/images/projects/phantomware/2.jpg"
  - "/images/projects/phantomware/3.jpg"
---

A fully custom-built multi-tool device based on the ESP32-S3, designed for wireless analysis, signal interaction, and hardware experimentation — my take on a Flipper Zero, built from scratch.

## Hardware

- ESP32-S3 + custom PCBA
- 320×240 ST7789 TFT display
- 3000mAh battery (USB-C charging via TP4056)
- SD card storage
- 3× IR LEDs + IR receiver
- NRF24L01 expansion (GPIO-based module board)
- Temperature sensor + battery gauge
- Buzzer + 5-way navigation buttons

## Capabilities

- GPIO toolkit: PWM generator, oscilloscope, frequency analyser, voltmeter, UART bridge
- WiFi tools: scanning, monitoring, deauth (educational), beacon spam, evil portal, AP hosting
- Bluetooth tools: scanning, advertisement spoofing, device spam (Apple/Samsung/Windows)
- BadUSB / BadBT functionality
- ESP-NOW & NRF chat systems
- Expandable modules: GPS, PN532 NFC

## Software

- Modular UI with multiple menu styles
- File uploads over WiFi (SPIFFS)
- Fully extensible tool framework

## Phantomware vs. Flipper Zero

| Feature | Phantomware | Flipper Zero* |
| --- | --- | --- |
| Microcontroller | ESP32 S3 Dual-core XTensa LX7 | STM32WB55RG |
| Bluetooth and WiFi? | Bluetooth 5 & WiFi 4 | Bluetooth 5.4 |
| Display | 2" 240x320 TFT LCD | 1.4" 128x64 Monochrome |
| IR Transceiver | 3x VSMY14940 LEDs + TSOP75438WTR | 3x VSMY14940 + TSOP75338TR |
| NFC Support | PN532 via SPI | ST25R3916 |
| Battery & Power Mgmt | 3000mAh LiPo + TP4056 + MAX17055 | 2100mAh + BQ25896 + BQ27220 |
| Expansion Options | Micro SD + 16 GPIOs | Micro SD + 18 GPIOs |
| Target Use Case | Signal analysis, RFID/NFC, IR, tinkering | Sub-GHz, RFID/NFC, IR, utility |
| Open Source? | Open Source & fully customisable | Open Source with limitations |
| Typical Price Point | ~$50 USD | $200 USD |

*Information for Flipper Zero is based on publicly available specifications and may vary.*

## Schematics & Drawings

Front, back, 3D views, PCB layout, and schematic.

<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1em; margin: 1.5em 0;">
  <img src="/images/projects/phantomware/schematics/front.png" alt="Front of PCB" />
  <img src="/images/projects/phantomware/schematics/back.png" alt="Back of PCB" />
  <img src="/images/projects/phantomware/schematics/pcb.png" alt="PCB wiring / routing" />
  <img src="/images/projects/phantomware/schematics/3d-1.png" alt="3D view — angle 1" />
  <img src="/images/projects/phantomware/schematics/3d-2.png" alt="3D view — angle 2" />
  <img src="/images/projects/phantomware/schematics/3d-3.png" alt="3D view — angle 3" />
  <img src="/images/projects/phantomware/schematics/3d-4.png" alt="3D view — angle 4" />
</div>

**Schematic (PDF)**

<div style="margin: 1.5em 0; border: 1px solid var(--border); border-radius: 10px; overflow: hidden;">
  <iframe src="/images/projects/phantomware/schematics/schematic.pdf" style="width:100%; height:600px; border:none; display:block; background:#fff;" title="Phantomware schematic PDF"></iframe>
</div>

[Open schematic in a new tab](/images/projects/phantomware/schematics/schematic.pdf)

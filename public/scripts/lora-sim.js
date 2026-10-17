/* LoRa Portable Messenger simulator for designedbykoda.com
   Firmware facts (screens, packet format, radio defaults, settings) come from the real code.
   Anything marked GUESS below was not in the firmware answer. */
(function () {
'use strict';
var root = document.getElementById('lora-sim');
if (!root || root.getAttribute('data-ready')) return;
root.setAttribute('data-ready', '1');
var NS = 'http://www.w3.org/2000/svg';
var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
var FONT = [
0,0,0,0,0,62,91,79,91,62,62,107,79,107,62,28,62,124,62,28,24,60,126,60,24,28,87,125,87,28,28,94,127,94,28,0,24,60,24,0,255,231,195,231,255,0,24,36,24,0,255,231,219,231,255,48,72,58,6,14,38,41,121,41,38,64,127,5,5,7,64,127,5,37,63,90,60,231,60,90,127,62,28,28,8,8,28,28,62,127,20,34,127,34,20,95,95,0,95,95,6,9,127,1,127,0,102,137,149,106,96,96,96,96,96,148,162,255,162,148,8,4,126,4,8,16,32,126,32,16,8,8,42,28,8,8,28,42,8,8,30,16,16,16,16,12,30,12,30,12,48,56,62,56,48,6,14,62,14,6,0,0,0,0,0,0,0,95,0,0,0,7,0,7,0,20,127,20,127,20,36,42,127,42,18,35,19,8,100,98,54,73,86,32,80,0,8,7,3,0,0,28,34,65,0,0,65,34,28,0,42,28,127,28,42,8,8,62,8,8,0,128,112,48,0,8,8,8,8,8,0,0,96,96,0,32,16,8,4,2,62,81,73,69,62,0,66,127,64,0,114,73,73,73,70,33,65,73,77,51,24,20,18,127,16,39,69,69,69,57,60,74,73,73,49,65,33,17,9,7,54,73,73,73,54,70,73,73,41,30,0,0,20,0,0,0,64,52,0,0,0,8,20,34,65,20,20,20,20,20,0,65,34,20,8,2,1,89,9,6,62,65,93,89,78,124,18,17,18,124,127,73,73,73,54,62,65,65,65,34,127,65,65,65,62,127,73,73,73,65,127,9,9,9,1,62,65,65,81,115,127,8,8,8,127,0,65,127,65,0,32,64,65,63,1,127,8,20,34,65,127,64,64,64,64,127,2,28,2,127,127,4,8,16,127,62,65,65,65,62,127,9,9,9,6,62,65,81,33,94,127,9,25,41,70,38,73,73,73,50,3,1,127,1,3,63,64,64,64,63,31,32,64,32,31,63,64,56,64,63,99,20,8,20,99,3,4,120,4,3,97,89,73,77,67,0,127,65,65,65,2,4,8,16,32,0,65,65,65,127,4,2,1,2,4,64,64,64,64,64,0,3,7,8,0,32,84,84,120,64,127,40,68,68,56,56,68,68,68,40,56,68,68,40,127,56,84,84,84,24,0,8,126,9,2,24,164,164,156,120,127,8,4,4,120,0,68,125,64,0,32,64,64,61,0,127,16,40,68,0,0,65,127,64,0,124,4,120,4,120,124,8,4,4,120,56,68,68,68,56,252,24,36,36,24,24,36,36,24,252,124,8,4,4,8,72,84,84,84,36,4,4,63,68,36,60,64,64,32,124,28,32,64,32,28,60,64,48,64,60,68,40,16,40,68,76,144,144,144,124,68,100,84,76,68,0,8,54,65,0,0,0,119,0,0,0,65,54,8,0,2,1,2,4,2,60,38,35,38,60,30,161,161,97,18,58,64,64,32,122,56,84,84,85,89,33,85,85,121,65,34,84,84,120,66,33,85,84,120,64,32,84,85,121,64,12,30,82,114,18,57,85,85,85,89,57,84,84,84,89,57,85,84,84,88,0,0,69,124,65,0,2,69,125,66,0,1,69,124,64,125,18,17,18,125,240,40,37,40,240,124,84,85,69,0,32,84,84,124,84,124,10,9,127,73,50,73,73,73,50,58,68,68,68,58,50,74,72,72,48,58,65,65,33,122,58,66,64,32,120,0,157,160,160,125,61,66,66,66,61,61,64,64,64,61,60,36,255,36,36,72,126,73,67,102,43,47,252,47,43,255,9,41,246,32,192,136,126,9,3,32,84,84,121,65,0,0,68,125,65,48,72,72,74,50,56,64,64,34,122,0,122,10,10,114,125,13,25,49,125,38,41,41,47,40,38,41,41,41,38,48,72,77,64,32,56,8,8,8,8,8,8,8,8,56,47,16,200,172,186,47,16,40,52,250,0,0,123,0,0,8,20,42,20,34,34,20,42,20,8,85,0,85,0,85,170,85,170,85,170,255,85,255,85,255,0,0,0,255,0,16,16,16,255,0,20,20,20,255,0,16,16,255,0,255,16,16,240,16,240,20,20,20,252,0,20,20,247,0,255,0,0,255,0,255,20,20,244,4,252,20,20,23,16,31,16,16,31,16,31,20,20,20,31,0,16,16,16,240,0,0,0,0,31,16,16,16,16,31,16,16,16,16,240,16,0,0,0,255,16,16,16,16,16,16,16,16,16,255,16,0,0,0,255,20,0,0,255,0,255,0,0,31,16,23,0,0,252,4,244,20,20,23,16,23,20,20,244,4,244,0,0,255,0,247,20,20,20,20,20,20,20,247,0,247,20,20,20,23,20,16,16,31,16,31,20,20,20,244,20,16,16,240,16,240,0,0,31,16,31,0,0,0,31,20,0,0,0,252,20,0,0,240,16,240,16,16,255,16,255,20,20,20,255,20,16,16,16,31,0,0,0,0,240,16,255,255,255,255,255,240,240,240,240,240,255,255,255,0,0,0,0,0,255,255,15,15,15,15,15,56,68,68,56,68,252,74,74,74,52,126,2,2,6,6,2,126,2,126,2,99,85,73,65,99,56,68,68,60,4,64,126,32,30,32,6,2,126,2,2,153,165,231,165,153,28,42,73,42,28,76,114,1,114,76,48,74,77,77,48,48,72,120,72,48,188,98,90,70,61,62,73,73,73,0,126,1,1,1,126,42,42,42,42,42,68,68,95,68,68,64,81,74,68,64,64,68,74,81,64,0,0,255,1,3,224,128,255,0,0,8,8,107,107,8,54,18,54,36,54,6,15,9,15,6,0,0,24,24,0,0,0,16,16,0,48,64,255,1,1,0,31,1,1,30,0,25,29,23,18,0,60,60,60,60,0,0,0,0,0];
var ART = "\n\n<g fill=\"none\" stroke=\"#e8eef4\" stroke-width=\"2\" stroke-linejoin=\"round\" stroke-linecap=\"round\">\n\n<g id=\"board\">\n  <path d=\"M6.0,6.0 L596.0,6.0 L596.0,923.062 L6.0,923.062 L6.0,6.0 Z\"/>\n</g>\n\n<g id=\"mounting-holes\">\n  \n</g>\n\n<g id=\"tft-bezel\">\n  <rect x=\"43.5\" y=\"219.0\" width=\"515.0\" height=\"350.0\"/>\n</g>\n\n<rect id=\"tft-display\" stroke=\"none\" x=\"97.0\" y=\"241.0\" width=\"408.0\" height=\"306.0\"/>\n\n<g id=\"btn-1\">\n  <polygon points=\"369.9,694.1 385.1,678.9 430.9,678.9 446.1,694.1 446.1,739.9 430.9,755.1 385.1,755.1 369.9,739.9\"/>\n  <circle cx=\"408.0\" cy=\"717.0\" r=\"24.1\"/>\n  <circle cx=\"408.0\" cy=\"717.0\" r=\"15.3\" stroke-opacity=\"0.35\"/>\n  <polygon points=\"397.8,717.0 408.0,706.8 418.2,717.0 408.0,727.2\"/>\n</g>\n\n<g id=\"power-switch\">\n  <rect x=\"560.6\" y=\"121.0\" width=\"26.0\" height=\"68.0\" rx=\"1.5\"/>\n  <rect x=\"586.6\" y=\"147.0\" width=\"14.0\" height=\"13.0\" rx=\"1.5\"/>\n</g>\n\n<g id=\"neopixel\">\n  <rect x=\"517.0\" y=\"596.0\" width=\"20.0\" height=\"20.0\" rx=\"1.0\"/>\n  <circle cx=\"527.0\" cy=\"606.0\" r=\"5.5\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"buzzer\">\n  <rect x=\"269.5\" y=\"580.5\" width=\"75.0\" height=\"75.0\" rx=\"3.0\"/>\n</g>\n\n<g id=\"gps-module\">\n  <rect x=\"369.6\" y=\"89.3\" width=\"101.0\" height=\"97.0\" rx=\"2.0\"/>\n</g>\n\n<g id=\"gps-antenna\">\n  <rect x=\"487.0\" y=\"105.0\" width=\"26.0\" height=\"26.0\" rx=\"1.5\"/>\n  <circle cx=\"500.0\" cy=\"118.0\" r=\"9.5\"/>\n  <circle cx=\"500.0\" cy=\"118.0\" r=\"3.0\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"lora-module\">\n  <rect x=\"144.0\" y=\"38.0\" width=\"160.0\" height=\"170.0\" rx=\"3.0\"/>\n  <rect x=\"154.0\" y=\"74.0\" width=\"140.0\" height=\"124.0\" rx=\"6.0\"/>\n  <path d=\"M144.0,48.8 A4.2,4.2 0 0 1 144.0,57.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M144.0,68.8 A4.2,4.2 0 0 1 144.0,77.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M144.0,88.8 A4.2,4.2 0 0 1 144.0,97.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M144.0,108.8 A4.2,4.2 0 0 1 144.0,117.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M144.0,128.8 A4.2,4.2 0 0 1 144.0,137.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M144.0,148.8 A4.2,4.2 0 0 1 144.0,157.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M144.0,168.8 A4.2,4.2 0 0 1 144.0,177.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M144.0,188.8 A4.2,4.2 0 0 1 144.0,197.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M304.0,188.8 A4.2,4.2 0 0 0 304.0,197.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M304.0,168.8 A4.2,4.2 0 0 0 304.0,177.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M304.0,148.8 A4.2,4.2 0 0 0 304.0,157.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M304.0,128.8 A4.2,4.2 0 0 0 304.0,137.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M304.0,108.8 A4.2,4.2 0 0 0 304.0,117.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M304.0,88.8 A4.2,4.2 0 0 0 304.0,97.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M304.0,68.8 A4.2,4.2 0 0 0 304.0,77.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M304.0,48.8 A4.2,4.2 0 0 0 304.0,57.2\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"lora-ipex\">\n  <rect x=\"157.0\" y=\"42.5\" width=\"26.0\" height=\"26.0\" rx=\"2.0\"/>\n  <circle cx=\"170.0\" cy=\"55.5\" r=\"8.0\"/>\n  <circle cx=\"170.0\" cy=\"55.5\" r=\"2.5\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"lora-antenna\">\n  <rect x=\"24.4\" y=\"20.4\" width=\"68.6\" height=\"71.2\" rx=\"2.0\"/>\n  <polyline points=\"31.7,6.0 31.7,20.4 85.7,20.4 85.7,6.0\"/>\n  <circle cx=\"58.7\" cy=\"56.0\" r=\"7.0\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"compass\">\n  <rect x=\"66.995\" y=\"864.0\" width=\"30.0\" height=\"30.0\" rx=\"1.0\"/>\n</g>\n\n<g id=\"aht20\">\n  <rect x=\"138.469\" y=\"872.002\" width=\"30.0\" height=\"30.0\" rx=\"1.0\"/>\n</g>\n\n<g id=\"bms\">\n  <rect x=\"430.5\" y=\"812.5\" width=\"39.0\" height=\"49.0\" rx=\"1.0\"/>\n  <circle cx=\"436.0\" cy=\"818.0\" r=\"2.0\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"fuel-gauge\">\n  <rect x=\"549.5\" y=\"773.15\" width=\"20.0\" height=\"20.0\" rx=\"1.0\"/>\n</g>\n\n<g id=\"led-1\">\n  <rect x=\"497.0\" y=\"828.5\" width=\"10.0\" height=\"5.0\" rx=\"0.6\"/>\n</g>\n\n<g id=\"led-2\">\n  <rect x=\"497.0\" y=\"840.5\" width=\"10.0\" height=\"5.0\" rx=\"0.6\"/>\n</g>\n\n<g id=\"usbc\">\n  <line x1=\"267.5\" y1=\"843.96\" x2=\"267.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"275.5\" y1=\"843.96\" x2=\"275.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"282.5\" y1=\"843.96\" x2=\"282.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"287.5\" y1=\"843.96\" x2=\"287.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"292.5\" y1=\"843.96\" x2=\"292.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"297.5\" y1=\"843.96\" x2=\"297.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"302.5\" y1=\"843.96\" x2=\"302.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"307.5\" y1=\"843.96\" x2=\"307.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"312.5\" y1=\"843.96\" x2=\"312.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"317.5\" y1=\"843.96\" x2=\"317.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"324.5\" y1=\"843.96\" x2=\"324.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <line x1=\"332.5\" y1=\"843.96\" x2=\"332.5\" y2=\"850.96\" stroke-opacity=\"0.35\"/>\n  <rect x=\"344.7\" y=\"850.96\" width=\"4.8\" height=\"11.0\" rx=\"1.0\"/>\n  <rect x=\"250.5\" y=\"850.96\" width=\"4.8\" height=\"11.0\" rx=\"1.0\"/>\n  <rect x=\"344.7\" y=\"892.71\" width=\"4.8\" height=\"11.0\" rx=\"1.0\"/>\n  <rect x=\"250.5\" y=\"892.71\" width=\"4.8\" height=\"11.0\" rx=\"1.0\"/>\n  <rect x=\"255.3\" y=\"850.96\" width=\"89.4\" height=\"73.0\" rx=\"6.0\"/>\n  <line x1=\"255.3\" y1=\"917.46\" x2=\"344.7\" y2=\"917.46\"/>\n  <rect x=\"265.0\" y=\"858.46\" width=\"70.0\" height=\"52.0\" rx=\"5.0\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"battery-connector\">\n  <circle cx=\"566.0\" cy=\"862.0\" r=\"8.0\"/>\n  <circle cx=\"566.0\" cy=\"862.0\" r=\"4.5\" stroke-opacity=\"0.35\"/>\n  <circle cx=\"566.0\" cy=\"892.0\" r=\"8.0\"/>\n  <circle cx=\"566.0\" cy=\"892.0\" r=\"4.5\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"esp32-antenna\">\n  <rect x=\"24.95\" y=\"804.0\" width=\"26.0\" height=\"26.0\" rx=\"2.0\"/>\n  <circle cx=\"37.95\" cy=\"817.0\" r=\"8.0\"/>\n  <circle cx=\"37.95\" cy=\"817.0\" r=\"2.5\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"esp32-module\">\n  <rect x=\"20.45\" y=\"663.0\" width=\"192.0\" height=\"180.0\" rx=\"3.0\"/>\n  <rect x=\"56.45\" y=\"673.0\" width=\"146.0\" height=\"160.0\" rx=\"6.0\"/>\n  <path d=\"M29.349999999999998,843.0 A4.2,4.2 0 0 1 37.75,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M42.05,843.0 A4.2,4.2 0 0 1 50.45,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M54.75,843.0 A4.2,4.2 0 0 1 63.150000000000006,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M67.45,843.0 A4.2,4.2 0 0 1 75.85000000000001,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M80.14999999999999,843.0 A4.2,4.2 0 0 1 88.55,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M92.85,843.0 A4.2,4.2 0 0 1 101.25,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M105.55,843.0 A4.2,4.2 0 0 1 113.95,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M118.25,843.0 A4.2,4.2 0 0 1 126.65,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M130.95000000000002,843.0 A4.2,4.2 0 0 1 139.35,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M143.65,843.0 A4.2,4.2 0 0 1 152.04999999999998,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M156.35000000000002,843.0 A4.2,4.2 0 0 1 164.75,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M169.05,843.0 A4.2,4.2 0 0 1 177.45,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M181.75,843.0 A4.2,4.2 0 0 1 190.14999999999998,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M194.45000000000002,843.0 A4.2,4.2 0 0 1 202.85,843.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,818.6999999999999 A4.2,4.2 0 0 0 212.45,827.1\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,806.0 A4.2,4.2 0 0 0 212.45,814.4000000000001\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,793.3 A4.2,4.2 0 0 0 212.45,801.7\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,780.5999999999999 A4.2,4.2 0 0 0 212.45,789.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,767.9 A4.2,4.2 0 0 0 212.45,776.3000000000001\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,755.1999999999999 A4.2,4.2 0 0 0 212.45,763.6\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,742.5 A4.2,4.2 0 0 0 212.45,750.9000000000001\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,729.8 A4.2,4.2 0 0 0 212.45,738.2\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,717.0999999999999 A4.2,4.2 0 0 0 212.45,725.5\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,704.4 A4.2,4.2 0 0 0 212.45,712.8000000000001\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,691.6999999999999 A4.2,4.2 0 0 0 212.45,700.1\" stroke-opacity=\"0.35\"/>\n  <path d=\"M212.45,679.0 A4.2,4.2 0 0 0 212.45,687.4000000000001\" stroke-opacity=\"0.35\"/>\n  <path d=\"M194.45000000000002,663.0 A4.2,4.2 0 0 0 202.85,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M181.75,663.0 A4.2,4.2 0 0 0 190.14999999999998,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M169.05,663.0 A4.2,4.2 0 0 0 177.45,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M156.35000000000002,663.0 A4.2,4.2 0 0 0 164.75,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M143.65,663.0 A4.2,4.2 0 0 0 152.04999999999998,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M130.95000000000002,663.0 A4.2,4.2 0 0 0 139.35,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M118.25,663.0 A4.2,4.2 0 0 0 126.65,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M105.55,663.0 A4.2,4.2 0 0 0 113.95,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M92.85,663.0 A4.2,4.2 0 0 0 101.25,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M80.14999999999999,663.0 A4.2,4.2 0 0 0 88.55,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M67.45,663.0 A4.2,4.2 0 0 0 75.85000000000001,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M54.75,663.0 A4.2,4.2 0 0 0 63.150000000000006,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M42.05,663.0 A4.2,4.2 0 0 0 50.45,663.0\" stroke-opacity=\"0.35\"/>\n  <path d=\"M29.349999999999998,663.0 A4.2,4.2 0 0 0 37.75,663.0\" stroke-opacity=\"0.35\"/>\n</g>\n\n<g id=\"labels\" fill=\"#e8eef4\" stroke=\"none\" font-family=\"Inter, 'Helvetica Neue', Arial, sans-serif\" font-weight=\"500\" letter-spacing=\"0.6\">\n  <text x=\"129.45\" y=\"753.12\" font-size=\"17.0\" text-anchor=\"middle\">ESP32-S3</text>\n  <text x=\"129.45\" y=\"774.6\" font-size=\"10.0\" text-anchor=\"middle\" fill-opacity=\"0.6\">WROOM-1U</text>\n  <text x=\"300.0\" y=\"836.46\" font-size=\"11.0\" text-anchor=\"middle\">USB-C</text>\n  <text x=\"224.0\" y=\"136.12\" font-size=\"17.0\" text-anchor=\"middle\">HT-RA62</text>\n  <text x=\"224.0\" y=\"157.6\" font-size=\"10.0\" text-anchor=\"middle\" fill-opacity=\"0.6\">LoRa</text>\n  <text x=\"408.0\" y=\"771.96\" font-size=\"11.0\" text-anchor=\"middle\">D-PAD</text>\n  <text x=\"573.6\" y=\"204.96\" font-size=\"11.0\" text-anchor=\"middle\">PWR</text>\n  <text x=\"307.0\" y=\"671.46\" font-size=\"11.0\" text-anchor=\"middle\">BUZZER</text>\n  <text x=\"527.0\" y=\"628.42\" font-size=\"9.5\" text-anchor=\"middle\">RGB</text>\n  <text x=\"500.0\" y=\"145.92\" font-size=\"9.5\" text-anchor=\"middle\">GPS ANT</text>\n  <text x=\"450.0\" y=\"876.92\" font-size=\"9.5\" text-anchor=\"middle\">CHARGER</text>\n  <text x=\"559.5\" y=\"805.06\" font-size=\"8.5\" text-anchor=\"middle\">FUEL</text>\n  <text x=\"82.0\" y=\"910.56\" font-size=\"8.5\" text-anchor=\"middle\">COMPASS</text>\n  <text x=\"153.5\" y=\"915.56\" font-size=\"8.5\" text-anchor=\"middle\">AHT20</text>\n  <text x=\"512.0\" y=\"833.88\" font-size=\"8.0\" text-anchor=\"start\">LED1</text>\n  <text x=\"512.0\" y=\"845.88\" font-size=\"8.0\" text-anchor=\"start\">LED2</text>\n</g>\n\n<g id=\"silk-text\" fill=\"#e8eef4\" stroke=\"none\" font-family=\"Inter, 'Helvetica Neue', Arial, sans-serif\">\n  <text id=\"text-title\" x=\"453.82\" y=\"33.97\" font-size=\"17.946\" font-weight=\"400\" textLength=\"118.75\" lengthAdjust=\"spacingAndGlyphs\">LoRa Radio v1</text>\n  <text id=\"text-handle\" x=\"461.56\" y=\"64.529\" font-size=\"12.337\" font-weight=\"400\" textLength=\"110.68\" lengthAdjust=\"spacingAndGlyphs\">@designedbykoda</text>\n  <text id=\"label-ant\" x=\"49.57\" y=\"104.92\" font-size=\"11.514\" font-weight=\"700\" textLength=\"18.86\" lengthAdjust=\"spacingAndGlyphs\">ANT</text>\n  <text id=\"label-gps\" x=\"361.45\" y=\"150.75\" font-size=\"11.692\" font-weight=\"700\" textLength=\"19.5\" lengthAdjust=\"spacingAndGlyphs\" transform=\"rotate(-90 361.45 150.75)\">GPS</text>\n  <text id=\"label-bat-plus\" x=\"526.42\" y=\"865.91\" font-size=\"11.486\" font-weight=\"700\" textLength=\"25.16\" lengthAdjust=\"spacingAndGlyphs\">BAT+</text>\n  <text id=\"label-bat-minus\" x=\"526.42\" y=\"895.91\" font-size=\"11.486\" font-weight=\"700\" textLength=\"25.16\" lengthAdjust=\"spacingAndGlyphs\">BAT\u2212</text>\n</g>\n\n</g>\n";

/* ---------- helpers ---------- */
function p2(n) { return (n < 10 ? '0' : '') + n; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function gauss() { var u = 0, v = 0; while (!u) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function now() { return performance.now(); }
function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }

/* ---------- firmware constants ---------- */
var THEMES = [
  { n: 'Classic Mono', p: [255, 255, 255], s: [150, 150, 150], d: [70, 70, 70], a: [200, 200, 200], v: [50, 50, 50] },
  { n: 'Amber', p: [255, 240, 220], s: [170, 130, 80], d: [80, 60, 40], a: [240, 170, 60], v: [60, 45, 25] },
  { n: 'Ice', p: [225, 240, 255], s: [110, 150, 175], d: [45, 65, 80], a: [90, 190, 230], v: [30, 45, 55] }
];
var OKC = [80, 220, 110], WARNC = [230, 180, 60], DANGC = [230, 70, 70];
var FREQS = [['AU/NZ 915', 915.0], ['US 915', 915.0], ['EU 868', 868.0], ['Asia 923', 923.0], ['India 865', 865.0]];
var TIMEOUTS = [['Never', 0], ['15 sec', 15000], ['30 sec', 30000], ['60 sec', 60000], ['2 min', 120000], ['5 min', 300000]];
var SHUTV = [0, 3.0, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6];
var CANNED = ['OK, all good here', 'On my way', 'Copy that', 'Need assistance', 'Meet at rally point', 'Low battery, will lose contact soon', 'Negative, unable to comply', 'Standing by'];
var MENU = ['Messages', 'Compass', 'GPS', 'Battery', 'Settings', 'System'];
var CARD8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
var CARDL = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
var FRAG_MAX = 179, HEADER_BYTES = 21, HIST = 60;
var BASE_LAT = -31.9505, BASE_LON = 115.8605;   /* generic Perth CBD point, not a real location */
var CAP_MAH = 3000;

/* ---------- state ---------- */
var settings = { bl: 80, blTimeout: 30000, theme: 0, menuStyle: 0, joy: 0, callsign: 'OPERATOR', freq: 0, pwr: 22, sf: 10, encOn: false, encKey: '', buzzOn: true, ledOn: true, gpsInMsg: true, battAlertOn: true, battThresh: 15, shutdownV: 0, compOff: null };
try { var sv = JSON.parse(localStorage.getItem('koda-lora-settings') || 'null'); if (sv) for (var k0 in sv) if (k0 in settings) settings[k0] = sv[k0]; } catch (e) { }
function saveSettings() { try { localStorage.setItem('koda-lora-settings', JSON.stringify(settings)); } catch (e) { } }

var dev = { on: true, asleep: false, usb: false, pct: 82, sky: true, heading: 40, spin: false, sound: true, tempC: 24.6, hum: 48, bootAt: 0, lastInput: 0, lastRssi: null, lastSnr: null, txUntil: 0, rxUntil: 0, lowFired: false, shutAt: 0, rate: -3.6, lastBattDraw: 0 };
var gps = { fix: false, sats: 0, since: 0, lat: BASE_LAT, lon: BASE_LON, alt: 12.4, nmea: [] };
var msgs = [];
var ui = { scr: 'BOOT', sel: 0, msel: 0, scroll: 0, viewEnd: 0, back: 'MENU', setSel: 0, setTop: 0, sub: 0, lora: 0, listSel: 0, emerg: false, calUntil: 0, calMsg: '', calMsgUntil: 0, calX: [9, -9], calY: [9, -9], dirty: true, penc: null };
var kb = { mode: 'compose', set: 0, row: 0, col: 0, text: '', max: 179 * 2, ret: 'MSGS' };
var alarm = { on: false, t: 0 };
var remote = { follow: true, sf: 10, freq: 0, env: 1, dist: 1.0, auto: true, enc: false, key: 'koda' };

/* ---------- canvas TFT (320x240, Adafruit GFX 5x7 font) ---------- */
var cv = null, g = null, SC = 3;
function th() { return THEMES[settings.theme]; }
function col(a) { return 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')'; }
function R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
function RO(x, y, w, h, c) { R(x, y, w, 1, c); R(x, y + h - 1, w, 1, c); R(x, y, 1, h, c); R(x + w - 1, y, 1, h, c); }
function TX(x, y, s, size, c) {
  s = String(s); size = size || 1; g.fillStyle = c; g.beginPath();
  for (var k = 0; k < s.length; k++) {
    var ch = s.charCodeAt(k); if (ch > 255) ch = 63;
    for (var i = 0; i < 5; i++) {
      var b = FONT[ch * 5 + i]; if (!b) continue;
      for (var j = 0; j < 8; j++) if ((b >> j) & 1) g.rect(x + (k * 6 + i) * size, y + j * size, size, size);
    }
  }
  g.fill();
}
function TW(s, size) { return String(s).length * 6 * (size || 1) - (size || 1); }
function TXC(cx, y, s, size, c) { TX(Math.round(cx - TW(s, size) / 2), y, s, size, c); }
function TXR(rx, y, s, size, c) { TX(Math.round(rx - TW(s, size)), y, s, size, c); }
function wrapText(s, max) {
  var words = String(s).split(' '), lines = [], cur = '';
  words.forEach(function (w) {
    while (w.length > max) { if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, max)); w = w.slice(max); }
    if (!cur) cur = w; else if ((cur + ' ' + w).length <= max) cur += ' ' + w; else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur); return lines;
}

/* ---------- sound (opt-in WebAudio, patterns from the firmware) ---------- */
var actx = null, buzzUntil = 0;
function tone(f, ms, delay) {
  if (!settings.buzzOn || !dev.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var t = actx.currentTime + (delay || 0) / 1000, o = actx.createOscillator(), gn = actx.createGain();
    o.type = 'square'; o.frequency.value = f; gn.gain.setValueAtTime(0.035, t); gn.gain.setValueAtTime(0, t + ms / 1000);
    o.connect(gn); gn.connect(actx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
  } catch (e) { }
  buzzUntil = Math.max(buzzUntil, now() + (delay || 0) + ms);
}
function sndRecv() { tone(1800, 90, 0); tone(2100, 90, 140); }
function sndSent() { tone(2600, 60, 0); }
function sndLow() { tone(1200, 80, 0); tone(1000, 80, 120); tone(800, 80, 240); }
var alarmOsc = null, alarmIv = 0;
/* Emergency alarm: one continuous two-tone oscillator (1400 / 900 Hz, 160 ms each) that keeps going until CENTER is pressed or the device loses power. */
function startAlarm() {
  if (alarm.on) return; alarm.on = true; clearTimeout(alarm.t); alarm.t = setTimeout(stopAlarm, 3000);
  if (!settings.buzzOn || !dev.sound) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    var o = actx.createOscillator(), gn = actx.createGain(), hi = true;
    o.type = 'square'; o.frequency.value = 1400; gn.gain.value = 0.035; o.connect(gn); gn.connect(actx.destination); o.start();
    alarmOsc = o; alarmIv = setInterval(function () { hi = !hi; try { o.frequency.setValueAtTime(hi ? 1400 : 900, actx.currentTime); } catch (e) { } }, 160);
  } catch (e) { }
}
function stopAlarm() {
  alarm.on = false; clearInterval(alarmIv); clearTimeout(alarm.t);
  if (alarmOsc) { try { alarmOsc.stop(); } catch (e) { } alarmOsc = null; }
}

/* ---------- simulated hardware ---------- */
var VT = [[0, 3.30], [5, 3.50], [10, 3.60], [20, 3.68], [40, 3.76], [60, 3.85], [80, 4.00], [100, 4.18]];
function battV() {
  var p = clamp(dev.pct, 0, 100), v = VT[VT.length - 1][1];
  for (var i = 1; i < VT.length; i++) if (p <= VT[i][0]) { var a = VT[i - 1], b = VT[i]; v = a[1] + (b[1] - a[1]) * (p - a[0]) / (b[0] - a[0]); break; }
  return v + (dev.usb && dev.pct < 99.5 ? 0.06 : 0);
}
function drawMa() { return dev.on && !dev.asleep ? 62 + 0.9 * settings.bl * (backlightLevel() > 0.5 ? 1 : 0.15) : 0; }
function chargeMa() { return dev.usb ? (dev.pct < 90 ? 500 : Math.max(20, 500 * (100 - dev.pct) / 10)) : 0; }
function hasFix() { return gps.fix; }
function utc() { var d = new Date(); return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), d: d }; }
var HI = { x: 0.07, y: -0.05 }, FIELD = 0.30;
function rawMag() {
  var h = dev.heading * Math.PI / 180;
  return { x: FIELD * Math.sin(h) + HI.x + gauss() * 0.002, y: FIELD * Math.cos(h) + HI.y + gauss() * 0.002, z: -0.38 + gauss() * 0.002 };
}
function headingNow() {
  var m = rawMag(), o = settings.compOff || { x: 0, y: 0 };
  var d = Math.atan2(m.x - o.x, m.y - o.y) * 180 / Math.PI; if (d < 0) d += 360; return { deg: d, m: m };
}
function nmeaSum(s) { var c = 0; for (var i = 0; i < s.length; i++) c ^= s.charCodeAt(i); return (c < 16 ? '0' : '') + c.toString(16).toUpperCase(); }
function nmeaNext() {
  var t = utc(), hh = p2(t.h) + p2(t.m) + p2(t.s) + '.00', d = t.d;
  function dm(v, lat) { var a = Math.abs(v), dd = Math.floor(a), mm = (a - dd) * 60; return (lat ? p2(dd) : ('00' + dd).slice(-3)) + (mm < 10 ? '0' : '') + mm.toFixed(5); }
  var ns = gps.lat < 0 ? 'S' : 'N', ew = gps.lon < 0 ? 'W' : 'E', k = gps.nmea.k = ((gps.nmea.k || 0) + 1) % 4, s;
  if (!gps.fix) s = k % 2 ? 'GPGSV,3,1,' + p2(gps.sats) + ',01,40,083,25' : 'GPGGA,' + hh + ',,,,,0,00,99.99,,,,,,';
  else if (k === 0) s = 'GPGGA,' + hh + ',' + dm(gps.lat, 1) + ',' + ns + ',' + dm(gps.lon) + ',' + ew + ',1,' + p2(gps.sats) + ',1.1,' + gps.alt.toFixed(1) + ',M,0.0,M,,';
  else if (k === 1) s = 'GPRMC,' + hh + ',A,' + dm(gps.lat, 1) + ',' + ns + ',' + dm(gps.lon) + ',' + ew + ',0.0,0.0,' + p2(d.getUTCDate()) + p2(d.getUTCMonth() + 1) + String(d.getUTCFullYear()).slice(2) + ',,,A';
  else if (k === 2) s = 'GPGSA,A,3,03,07,09,14,17,22,,,,,,,1.9,1.1,1.5';
  else s = 'GPGSV,3,1,' + p2(gps.sats) + ',03,40,083,41,07,63,310,38';
  var line = '$' + s + '*' + nmeaSum(s); gps.nmea.push(line); if (gps.nmea.length > 5) gps.nmea.shift();
}

/* ---------- backlight ---------- */
function backlightLevel() {
  if (!dev.on || dev.asleep) return 0;
  var idle = now() - dev.lastInput;
  var dim = settings.blTimeout > 0 && idle > settings.blTimeout;
  return dim ? 0.08 : Math.max(0.04, settings.bl / 100);
}
function wake() { dev.lastInput = now(); ui.dirty = true; }

/* ---------- screens ---------- */
function setBody() { R(0, 0, 320, 240, '#000'); }
function hint(s) { TX(4, 232, s, 1, col(th().d)); }
function header() {
  var T = th(), t = utc();
  R(0, 0, 320, 17, '#000'); R(0, 17, 320, 1, col(T.v));
  if (hasFix()) TX(4, 5, p2(t.h) + ':' + p2(t.m), 1, col(T.p));
  var hd = headingNow().deg, idx = Math.floor((hd + 22.5) / 45) % 8;
  TXC(160, 5, CARD8[idx], 1, col(T.a));
  var gx = 320 - 4 - 18; TX(gx, 5, 'GPS', 1, col(hasFix() ? OKC : DANGC));
  var bt = Math.round(clamp(dev.pct, 0, 100)) + '%', bx = gx - 6 - TW(bt, 1);
  TX(bx, 5, bt, 1, col(dev.pct < 15 ? DANGC : T.p));
  var tt = dev.tempC.toFixed(1) + 'C', tx = bx - 8 - TW(tt, 1);
  if (tx > 30) TX(tx, 5, tt, 1, col(T.s));
}
function drawBoot() { var T = th(); TXC(160, 100, 'Handheld LoRa Communicator', 2, col(T.p)); TXC(160, 130, 'v1.0.0', 1, col(T.s)); }
function drawMenu() {
  var T = th(), n = MENU.length, i = ui.msel;
  if (settings.menuStyle === 0) {
    TXC(160, 52, MENU[(i + n - 1) % n], 2, col(T.d));
    R(70, 84, 180, 1, col(T.v)); R(70, 134, 180, 1, col(T.v));
    TXC(160, 98, MENU[i], 3, col(T.a));
    TXC(160, 150, MENU[(i + 1) % n], 2, col(T.d));
    for (var d = 0; d < n; d++) R(160 - n * 6 + d * 12 + 2, 200, d === i ? 8 : 4, 4, col(d === i ? T.a : T.v));
    hint('UP/DOWN: browse   CENTER: open');
  } else {
    for (var r = 0; r < n; r++) {
      var y = 26 + r * 30, on = r === i;
      if (on) R(8, y - 4, 304, 28, col(T.v));
      TX(18, y + 2, MENU[r], 2, col(on ? T.a : T.p)); if (on) TX(290, y + 2, '>', 2, col(T.a));
    }
    hint('UP/DOWN: select   CENTER: open');
  }
}
function msgLines(m) {
  var body = m.text, ls = wrapText(body, 50);
  if (ls.length > 2) { ls = ls.slice(0, 2); ls[1] = ls[1].slice(0, Math.max(0, 47)) + '...'; }
  return ls;
}
function drawMsgs() {
  var T = th();
  if (!msgs.length) { TXC(160, 92, 'No messages yet', 2, col(T.s)); TXC(160, 120, 'CENTER: compose', 1, col(T.d)); hint('UP/DOWN: scroll  CENTER: compose  LEFT: back'); return; }
  var end = Math.min(ui.viewEnd, msgs.length - 1), start = Math.max(0, end - 5), y = 20;
  for (var i = start; i <= end; i++) {
    var m = msgs[i], c = m.emergency ? DANGC : m.out ? T.a : T.p;
    var l1 = (m.out ? 'You' : m.sender) + (m.emergency ? ' [EMERGENCY]' : '') + (m.enc ? ' [ENC]' : '') + (m.ts ? ' ' + m.ts : '');
    TX(4, y + 2, l1, 1, col(c));
    var ls = msgLines(m); for (var k = 0; k < ls.length; k++) TX(4, y + 12 + k * 10, ls[k], 1, col(T.s));
    R(0, y + 33, 320, 1, col(T.v)); y += 34;
  }
  hint('UP/DOWN: scroll  CENTER: compose  LEFT: back');
}
function rowsList(title, labels, vals, sel, top, rowH, size) {
  var T = th(); TX(10, 24, title, 2, col(T.a)); R(0, 44, 320, 1, col(T.v));
  var vis = Math.floor((228 - 50) / rowH), y = 50;
  for (var r = top; r < Math.min(labels.length, top + vis); r++) {
    var on = r === sel;
    if (on) R(6, y, 308, rowH - 2, col(T.v));
    TX(14, y + Math.round((rowH - 2 - 7 * size) / 2), labels[r], size, col(on ? T.a : T.p));
    if (vals && vals[r] != null) TXR(308, y + Math.round((rowH - 2 - 8) / 2), vals[r], 1, col(T.s));
    y += rowH;
  }
}
function drawCompose() {
  rowsList('Compose', ['Canned Phrases', 'Keyboard', 'Insert Sensor Data', 'Emergency: ' + (ui.emerg ? 'ON' : 'OFF')], null, ui.sel, 0, 30, 2);
  hint('UP/DOWN: select  CENTER: choose  LEFT: back');
}
function drawCanned() {
  var T = th(); TX(10, 24, 'Canned Phrases', 2, col(T.a)); R(0, 44, 320, 1, col(T.v));
  for (var i = 0; i < CANNED.length; i++) { var y = 50 + i * 22, on = i === ui.sel; if (on) R(6, y, 308, 20, col(T.v)); TX(14, y + 6, CANNED[i], 1, col(on ? T.a : T.p)); }
  hint('CENTER: send' + (ui.emerg ? ' (EMERGENCY)' : '') + '   LEFT: back');
}
function drawSensor() {
  rowsList('Insert Sensor Data', ['GPS Position', 'Altitude', 'Temperature', 'All Sensor Data'], null, ui.sel, 0, 30, 2);
  hint('CENTER: send   LEFT: back');
}
function kbRows() {
  if (kb.set === 0) return ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  if (kb.set === 1) return ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  return ['!@#$%^&*()', '-_=+[]{}\\|', ';:\'",.<>/', '?~`'];
}
var KB_BOTTOM = [['mode', 50], ['SPACE', 110], ['DEL', 50], ['X', 40], ['SEND', 60]];
function kbLabel(k) { return k === 'mode' ? ['abc', 'ABC', '#+='][kb.set] : k; }
function drawKb() {
  var T = th(), rows = kbRows();
  var shown = kb.text.length > 48 ? kb.text.slice(-48) : kb.text;
  RO(4, 20, 312, 26, col(T.a)); TX(8, 29, shown + (Math.floor(now() / 500) % 2 ? '_' : ' '), 1, col(T.p));
  var cnt = kb.text.length + '/' + kb.max; TXR(312, 38, cnt, 1, col(T.d));
  for (var r = 0; r < 4; r++) {
    var s = rows[r], x0 = Math.round((320 - s.length * 31) / 2), y = 52 + r * 32;
    for (var c = 0; c < s.length; c++) {
      var on = kb.row === r && kb.col === c, x = x0 + c * 31;
      if (on) R(x, y, 30, 28, col(T.a)); else RO(x, y, 30, 28, col(T.v));
      TXC(x + 15, y + 10, s[c], 1, on ? '#000' : col(T.p));
    }
  }
  var x = 5, y = 52 + 4 * 32;
  KB_BOTTOM.forEach(function (b, i) {
    var on = kb.row === 4 && kb.col === i, w = b[1], lbl = kbLabel(b[0]);
    var base = b[0] === 'X' ? DANGC : b[0] === 'SEND' ? OKC : T.p;
    if (on) R(x, y, w - 1, 28, col(b[0] === 'X' ? DANGC : b[0] === 'SEND' ? OKC : T.a)); else RO(x, y, w - 1, 28, col(T.v));
    TXC(x + (w - 1) / 2, y + 10, lbl, 1, on ? '#000' : col(base)); x += w;
  });
}
function drawCompass() {
  var T = th(), h = headingNow(), idx = Math.floor((h.deg + 22.5) / 45) % 8;
  if (ui.scr === 'CALIB') {
    var left = Math.max(0, Math.ceil((ui.calUntil - now()) / 1000));
    TXC(160, 30, 'Calibrating Compass', 2, col(T.a));
    TXC(160, 62, 'Rotate the device slowly in a circle', 1, col(T.s));
    var f = 1 - (ui.calUntil - now()) / 15000; RO(40, 90, 240, 16, col(T.a)); R(43, 93, Math.round(234 * clamp(f, 0, 1)), 10, col(T.a));
    TXC(160, 118, left + ' s remaining', 1, col(T.p));
    TXC(160, 140, 'Range so far: X ' + Math.max(0, ui.calX[1] - ui.calX[0]).toFixed(2) + ' Y ' + Math.max(0, ui.calY[1] - ui.calY[0]).toFixed(2), 1, col(T.s));
    hint('LEFT: cancel'); return;
  }
  if (now() < ui.calMsgUntil) { TXC(160, 100, ui.calMsg, 2, col(ui.calMsg.indexOf('saved') > 0 ? OKC : DANGC)); return; }
  TXC(160, 26, Math.round(h.deg) + '', 4, col(T.p)); TXC(160, 62, 'degrees', 1, col(T.s));
  TXC(160, 78, CARDL[idx], 2, col(T.a));
  var m = h.m, ys = 112;
  [['X', m.x], ['Y', m.y], ['Z', m.z]].forEach(function (a, i) { TX(100, ys + i * 14, a[0] + '  ' + (a[1] >= 0 ? '+' : '-') + Math.abs(a[1]).toFixed(3).padStart(6) + ' G', 1, col(T.s)); });
  TXC(160, 162, settings.compOff ? 'Calibrated' : 'Not calibrated', 1, col(settings.compOff ? OKC : WARNC));
  hint('LEFT/CENTER: back   RIGHT: calibrate');
}
function drawGps() {
  var T = th(), t = utc(), d = t.d;
  if (!hasFix()) {
    TXC(160, 40, 'Waiting for GPS fix...', 2, col(T.s)); TXC(160, 74, 'Satellites: ' + gps.sats, 1, col(T.p));
  } else {
    var rows = [['Latitude', gps.lat.toFixed(6)], ['Longitude', gps.lon.toFixed(6)], ['Altitude', gps.alt.toFixed(1) + ' m'], ['Satellites', String(gps.sats)], ['Speed', '0.0 km/h'], ['Course', '0 deg'], ['Time', p2(t.h) + ':' + p2(t.m) + ':' + p2(t.s) + ' UTC'], ['Date', d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate())]];
    rows.forEach(function (r, i) { TX(8, 24 + i * 15, r[0], 1, col(T.s)); TX(110, 24 + i * 15, r[1], 1, col(T.p)); });
  }
  TX(8, 150, 'NMEA', 1, col(T.a)); R(0, 159, 320, 1, col(T.v));
  gps.nmea.forEach(function (l, i) { TX(4, 163 + i * 11, l.slice(0, 52), 1, col(T.d)); });
  hint('LEFT/CENTER: back');
}
function timeStr(hours) {
  if (Math.abs(dev.rate) < 0.05) return '-- (rate too low)';
  if (hours > 99) return '>99h';
  var s = Math.round(hours * 3600); return Math.floor(s / 3600) + 'h ' + p2(Math.floor(s % 3600 / 60)) + 'm ' + p2(s % 60) + 's';
}
function drawBatt() {
  var T = th(), p = Math.round(clamp(dev.pct, 0, 100)), c = p < 15 ? DANGC : p < 35 ? WARNC : OKC;
  TXC(160, 32, p + '%', 4, col(c));
  RO(70, 74, 180, 20, col(T.p)); R(73, 77, Math.round(174 * p / 100), 14, col(c));
  var chg = dev.rate >= 0.5, rem = CAP_MAH * p / 100, mA = dev.rate / 100 * CAP_MAH;
  var hrs = dev.rate < 0 ? rem / Math.abs(mA) : (CAP_MAH - rem) / Math.max(1, Math.abs(mA));
  var rows = [['Voltage:', battV().toFixed(3) + ' V'], ['Rate:', (dev.rate >= 0 ? '+' : '') + dev.rate.toFixed(1) + ' %/hr'], ['Status:', chg ? 'Charging' : 'Discharging'], ['Remaining:', rem.toFixed(0) + ' / 3000 mAh'], ['Est. draw:', (mA >= 0 ? '+' : '') + mA.toFixed(0) + ' mA'], [chg ? 'Time to full:' : 'Time to empty:', timeStr(hrs)]];
  rows.forEach(function (r, i) { TX(60, 110 + i * 15, r[0], 1, col(T.s)); TX(170, 110 + i * 15, r[1], 1, col(T.p)); });
  hint('LEFT or CENTER: back');
}
function drawSys() {
  var T = th();
  var rows = [['Firmware', '1.0.0'], ['CPU clock', '240 MHz'], ['Free heap', Math.round(212 + Math.sin(now() / 4000) * 3) + ' KB'], ['PSRAM', '8192 / 8100 KB'], ['Flash size', '16 MB'], ['Temperature', dev.tempC.toFixed(1) + ' C'], ['Humidity', dev.hum.toFixed(0) + ' %'], ['LoRa radio', 'OK'], ['Last RSSI', dev.lastRssi == null ? '--' : Math.round(dev.lastRssi) + ' dBm'], ['Last SNR', dev.lastSnr == null ? '--' : dev.lastSnr.toFixed(1) + ' dB'], ['Msg history', msgs.length + ' / ' + HIST], ['Uptime', Math.floor((now() - dev.bootAt) / 1000) + ' s']];
  rows.forEach(function (r, i) { TX(8, 24 + i * 15, r[0], 1, col(T.s)); TX(130, 24 + i * 15, r[1], 1, col(i === 7 ? OKC : T.p)); });
  hint('LEFT/CENTER: back');
}
function onOff(b) { return b ? 'On' : 'Off'; }
var SET_LABELS = ['Brightness', 'Backlight Timeout', 'Theme', 'Menu Style', 'Joystick', 'Call Sign', 'LoRa', 'Buzzer', 'Status LED', 'GPS Privacy', 'Battery Alert', 'Auto Shutdown', 'Back'];
function setVals() {
  return [settings.bl + '%', TIMEOUTS.filter(function (t) { return t[1] === settings.blTimeout; })[0][0], THEMES[settings.theme].n, settings.menuStyle ? 'Simple list' : 'Carousel', ['Normal', 'Rotated +45 (CW)', 'Rotated -45 (CCW)'][settings.joy], settings.callsign, '', onOff(settings.buzzOn), onOff(settings.ledOn), onOff(settings.gpsInMsg), settings.battAlertOn ? settings.battThresh + '%' : 'Off', settings.shutdownV ? settings.shutdownV.toFixed(1) + ' V' : 'Off', ''];
}
function drawSetMenu() {
  rowsList('Settings', SET_LABELS, setVals(), ui.setSel, ui.setTop, 24, 1 + 0);
  hint('UP/DOWN: scroll   CENTER: open   LEFT: back');
}
function bigVal(title, v, sub, bar) {
  var T = th(); TX(10, 24, title, 2, col(T.a)); R(0, 44, 320, 1, col(T.v));
  TXC(160, 82, v, 3, col(T.p));
  if (bar != null) { RO(40, 124, 240, 16, col(T.p)); R(43, 127, Math.round(234 * bar), 10, col(T.a)); }
  if (sub) sub.forEach(function (s, i) { TXC(160, 156 + i * 14, s, 1, col(T.s)); });
}
function drawSetSub() {
  var T = th(), s = ui.scr;
  if (s === 'S_BRI') { bigVal('Brightness', settings.bl + '%', null, settings.bl / 100); hint('LEFT/RIGHT: adjust   CENTER: back'); }
  else if (s === 'S_TMO') { rowsList('Backlight Timeout', TIMEOUTS.map(function (t) { return t[0]; }), null, ui.listSel, 0, 24, 2); hint('UP/DOWN: select   CENTER: apply'); }
  else if (s === 'S_THM') { rowsList('Theme', THEMES.map(function (t) { return t.n; }), null, ui.listSel, 0, 30, 2); hint('UP/DOWN: preview   CENTER: apply'); }
  else if (s === 'S_MNU') { rowsList('Menu Style', ['Carousel', 'Simple list'], null, ui.listSel, 0, 30, 2); hint('UP/DOWN: select   CENTER: apply'); }
  else if (s === 'S_JOY') { rowsList('Joystick', ['Normal', 'Rotated +45 (CW)', 'Rotated -45 (CCW)'], null, ui.listSel, 0, 30, 2); hint('UP/DOWN: select   CENTER: apply'); }
  else if (s === 'S_LORA') { rowsList('LoRa', ['Frequency', 'TX Power', 'Spreading Factor', 'Encryption', 'Back'], [FREQS[settings.freq][0], settings.pwr + ' dBm', 'SF' + settings.sf, settings.encOn ? 'On' : 'Off', ''], ui.lora, 0, 30, 2); hint('UP/DOWN: scroll   CENTER: open   LEFT: back'); }
  else if (s === 'S_FRQ') { rowsList('LoRa Frequency', FREQS.map(function (f) { return f[0]; }), FREQS.map(function (f) { return f[1].toFixed(1) + ' MHz'; }), ui.listSel, 0, 30, 2); hint('UP/DOWN: select   CENTER: apply'); }
  else if (s === 'S_PWR') { bigVal('LoRa TX Power', settings.pwr + ' dBm', ['LEFT/RIGHT: -/+ 1 dBm (live)', 'range -9 to 22 dBm'], (settings.pwr + 9) / 31); hint('CENTER: back'); }
  else if (s === 'S_SF') { bigVal('Spreading Factor', 'SF' + settings.sf, ['LEFT/RIGHT: -/+ 1 (live)', 'higher = longer range, slower'], (settings.sf - 7) / 5); hint('CENTER: back'); }
  else if (s === 'S_ENC') { bigVal('Encryption', settings.encOn ? 'ON' : 'OFF', [settings.encKey ? 'Key: ' + settings.encKey.length + ' chars set' : 'Key: not set', 'UP/DOWN: toggle'], null); hint('CENTER: enter key   LEFT: back'); }
  else if (s === 'S_BUZ') { bigVal('Buzzer', onOff(settings.buzzOn), null, null); hint('UP/DOWN: toggle   CENTER: back'); }
  else if (s === 'S_LED') { bigVal('Status LED', onOff(settings.ledOn), ['(currently has no visible effect --', 'LED hardware issue still open)'], null); hint('UP/DOWN: toggle   CENTER: back'); }
  else if (s === 'S_GPSP') { bigVal('GPS Privacy', onOff(settings.gpsInMsg), ['Include GPS time in messages'], null); hint('UP/DOWN: toggle   CENTER: back'); }
  else if (s === 'S_BATT') { bigVal('Battery Alert', settings.battAlertOn ? settings.battThresh + '%' : 'Off', ['UP: toggle   LEFT/RIGHT: threshold -/+ 5'], null); hint('CENTER: back'); }
  else if (s === 'S_SHUT') { rowsList('Auto Shutdown', SHUTV.map(function (v) { return v ? v.toFixed(1) + ' V' : 'Off'; }), null, ui.listSel, ui.setTop, 22, 1 + 1 - 1); hint('UP/DOWN: select   CENTER: apply'); }
}
function drawShut() { var T = th(); TXC(160, 100, 'BATTERY CRITICAL', 2, col(DANGC)); TXC(160, 130, 'Shutting down', 1, col(T.s)); }
function renderTft() {
  if (!g) return;
  setBody();
  if (!dev.on || dev.asleep) return;
  var s = ui.scr;
  if (s === 'BOOT') drawBoot();
  else if (s === 'SHUT') drawShut();
  else {
    if (s === 'MENU') drawMenu(); else if (s === 'MSGS') drawMsgs(); else if (s === 'COMPOSE') drawCompose();
    else if (s === 'CANNED') drawCanned(); else if (s === 'SENSOR') drawSensor(); else if (s === 'KEYB') drawKb();
    else if (s === 'COMPASS' || s === 'CALIB') drawCompass(); else if (s === 'GPS') drawGps(); else if (s === 'BATT') drawBatt();
    else if (s === 'SYS') drawSys(); else if (s === 'SETM') drawSetMenu(); else drawSetSub();
    header();
  }
}

/* ---------- radio model (the distance is a simulator-only control; the device has no distance feature) ---------- */
var ENVS = [{ n: 'Open, line of sight', L: 10, k: 4.3 }, { n: 'Suburban', L: 15, k: 12.6 }, { n: 'Dense urban', L: 20, k: 42 }];
function noiseFloor() { return -174 + 10 * Math.log10(125000) + 6; }
function snrLim(sf) { return -7.5 - 2.5 * (sf - 7); }
function sens(sf) { return noiseFloor() + snrLim(sf); }
function pathLoss(dKm, fMHz, env) { return 32.44 + 20 * Math.log10(fMHz) + 20 * Math.log10(dKm) + env.L + Math.min(env.k * dKm, 70); }
function airtime(sf, bytes) {
  var tsym = Math.pow(2, sf) / 125000 * 1000, de = tsym > 16 ? 1 : 0, pre = 12.25 * tsym;
  var n = 8 + Math.max(Math.ceil((8 * bytes - 4 * sf + 28 + 16) / (4 * (sf - 2 * de))) * 7, 0);
  return pre + n * tsym;
}
function fMHz(i) { return FREQS[i][1]; }
function compat() { return remote.sf === settings.sf && fMHz(remote.freq) === fMHz(settings.freq); }
function linkMean(txPwr, sf) { var pl = pathLoss(remote.dist, fMHz(settings.freq), ENVS[remote.env]); return { pl: pl, rssi: txPwr - pl, sens: sens(sf) }; }
function fragsOf(text) { var a = [], t = text; if (!t.length) return [0]; while (t.length) { a.push(Math.min(FRAG_MAX, t.length)); t = t.slice(FRAG_MAX); } return a; }
function airTotal(sf, frs) { var s = 0; frs.forEach(function (l) { s += airtime(sf, HEADER_BYTES + l); }); return s; }
var onAir = { dur: 1, until: 0, kind: '', label: '' };
var rlog = [];
function remoteLog(cls, html) { rlog.push({ c: cls, h: html }); if (rlog.length > 6) rlog.shift(); logDirty = true; }
var logDirty = true;
function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
function garble(n) { var s = '', c = '#%&@?*~^+=<>'; for (var i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }

function sendMsg(text, emergency) {
  var enc = !!(settings.encOn && settings.encKey);
  var ts = hasFix() && settings.gpsInMsg ? (function () { var t = utc(); return p2(t.h) + ':' + p2(t.m) + ':' + p2(t.s); })() : null;
  msgs.push({ out: true, sender: settings.callsign, text: text, emergency: !!emergency, enc: enc, ts: ts });
  if (msgs.length > HIST) msgs.shift();
  var frs = fragsOf(text), air = airTotal(settings.sf, frs), t0 = now();
  dev.txUntil = t0 + air; onAir = { dur: air, until: t0 + air, kind: 'tx', label: 'You are transmitting' + (frs.length > 1 ? ' (' + frs.length + ' packets)' : '') };
  ui.emerg = false; ui.viewEnd = msgs.length - 1;
  setTimeout(function () { sndSent(); ui.dirty = true; }, air);
  setTimeout(function () { arriveAtRemote(text, emergency, enc, frs); }, air);
  remoteLog('tx', 'You sent ' + frs.length + ' packet' + (frs.length > 1 ? 's' : '') + ', ' + Math.round(air) + ' ms on air');
}
function arriveAtRemote(text, emergency, enc, frs) {
  var lk = linkMean(settings.pwr, settings.sf), ok = compat();
  if (!ok) { remoteLog('bad', 'Not heard: the other radio uses different ' + (remote.sf !== settings.sf ? 'SF' : 'frequency') + ' settings.'); return; }
  var worst = 1e9, snr = 0;
  frs.forEach(function () { var r = lk.rssi + gauss() * 2; if (r < worst) worst = r; });
  snr = Math.min(12, worst - noiseFloor());
  if (worst < lk.sens || snr < snrLim(settings.sf)) { remoteLog('bad', 'Lost on the way: ' + Math.round(worst) + ' dBm is below the ' + Math.round(lk.sens) + ' dBm limit. You are not told.'); return; }
  var shown = enc ? (remote.key === settings.encKey ? text : garble(Math.min(30, text.length))) : text;
  remoteLog('rx', 'Received ' + (emergency ? '[EMERGENCY] ' : '') + (enc ? '[ENC] ' : '') + '"' + esc(shown) + '" ' + Math.round(worst) + ' dBm / ' + snr.toFixed(1) + ' dB');
  if (remote.auto) setTimeout(function () { remoteSend(CANNED[[1, 2, 0, 7][Math.floor(Math.random() * 4)]], false); }, 2200 + Math.random() * 2600);
}
function remoteSend(text, emergency) {
  var frs = fragsOf(text), air = airTotal(remote.sf, frs), t0 = now();
  onAir = { dur: air, until: t0 + air, kind: 'rx', label: 'Other radio is transmitting' };
  dev.rxUntil = t0 + air;
  remoteLog('tx', 'Other radio sends ' + (emergency ? '[EMERGENCY] ' : '') + '"' + esc(text) + '"');
  setTimeout(function () {
    if (!dev.on || dev.asleep) { remoteLog('bad', 'Your device is off, nothing received.'); return; }
    if (now() < dev.txUntil) { remoteLog('bad', 'Your device was transmitting and missed it.'); return; }
    if (!compat()) { remoteLog('bad', 'Your device did not hear it: settings differ (check SF and frequency).'); return; }
    var lk = linkMean(22, remote.sf), worst = 1e9;
    frs.forEach(function () { var r = lk.rssi + gauss() * 2; if (r < worst) worst = r; });
    var snr = Math.min(12, worst - noiseFloor());
    if (worst < lk.sens || snr < snrLim(settings.sf)) { remoteLog('bad', 'Too weak to decode (' + Math.round(worst) + ' dBm). Move closer or raise SF.'); return; }
    dev.lastRssi = worst; dev.lastSnr = snr;
    var shown = text;
    if (remote.enc) shown = !settings.encOn || !settings.encKey ? '[encrypted message - no key set]' : settings.encKey === remote.key ? text : garble(Math.min(30, text.length));
    var t = utc();
    msgs.push({ out: false, sender: 'RANGER', text: shown, emergency: !!emergency, enc: remote.enc, ts: p2(t.h) + ':' + p2(t.m) + ':' + p2(t.s) });
    if (msgs.length > HIST) msgs.shift();
    var follow = ui.viewEnd >= msgs.length - 2; if (follow) ui.viewEnd = msgs.length - 1;
    wake(); if (emergency) startAlarm(); else sndRecv();
    remoteLog('rx', 'Your device received it: ' + Math.round(worst) + ' dBm, SNR ' + snr.toFixed(1) + ' dB');
  }, air);
}

/* ---------- navigation ---------- */
function go(s, o) { ui.scr = s; if (o) for (var k in o) ui[k] = o[k]; ui.dirty = true; }
function openKb(mode, init, max, ret) { kb.mode = mode; kb.text = init || ''; kb.max = max; kb.set = 0; kb.row = 1; kb.col = 0; kb.ret = ret; go('KEYB'); }
function sensorText(i) {
  var lat = gps.lat.toFixed(5), lon = gps.lon.toFixed(5), T = dev.tempC.toFixed(1);
  if (i === 0) return hasFix() ? 'Position: ' + lat + ', ' + lon : 'Position: no GPS fix';
  if (i === 1) return hasFix() ? 'Altitude: ' + gps.alt.toFixed(0) + ' m' : 'Altitude: no GPS fix';
  if (i === 2) return 'Temperature: ' + T + ' C';
  return 'Status: ' + (hasFix() ? lat + ',' + lon + ' alt ' + gps.alt.toFixed(0) + 'm' : 'no GPS fix') + ', ' + T + 'C';
}
function vstep(sel, k, n) { return k === 'up' ? (sel + n - 1) % n : k === 'down' ? (sel + 1) % n : sel; }
function listKeys(k, n, apply, back) {
  if (k === 'up' || k === 'down') ui.listSel = vstep(ui.listSel, k, n);
  else if (k === 'center') apply(ui.listSel);
  else if (k === 'left' && back) go(back);
  if (ui.setTop > ui.listSel) ui.setTop = ui.listSel; if (ui.listSel >= ui.setTop + 8) ui.setTop = ui.listSel - 7;
  ui.dirty = true;
}
function key(k) {
  if (!dev.on || dev.asleep || ui.scr === 'BOOT' || ui.scr === 'SHUT') return;
  if (now() < dev.txUntil) return;
  var first = now() - dev.lastInput > settings.blTimeout && settings.blTimeout > 0;
  wake();
  if (alarm.on && k === 'center') { stopAlarm(); return; }
  var s = ui.scr, n;
  if (s === 'MENU') {
    n = MENU.length;
    if (k === 'up' || k === 'down') ui.msel = vstep(ui.msel, k, n);
    else if (k === 'center') { var m = MENU[ui.msel]; if (m === 'Messages') go('MSGS', { viewEnd: Math.max(0, msgs.length - 1) }); else if (m === 'Compass') go('COMPASS'); else if (m === 'GPS') go('GPS'); else if (m === 'Battery') go('BATT'); else if (m === 'Settings') go('SETM', { setSel: 0, setTop: 0 }); else go('SYS'); }
  } else if (s === 'MSGS') {
    n = msgs.length;
    if (k === 'up') ui.viewEnd = Math.max(Math.min(5, n - 1), ui.viewEnd - 1);
    else if (k === 'down') ui.viewEnd = Math.min(n - 1, ui.viewEnd + 1);
    else if (k === 'left') go('MENU'); else if (k === 'center') go('COMPOSE', { sel: 0 });
  } else if (s === 'COMPOSE') {
    if (k === 'up' || k === 'down') ui.sel = vstep(ui.sel, k, 4);
    else if (k === 'left') go('MSGS');   /* deviation: the real firmware has no way back from this menu */
    else if (k === 'center') { if (ui.sel === 0) go('CANNED', { sel: 0 }); else if (ui.sel === 1) openKb('compose', '', 179 * 2, 'COMPOSE'); else if (ui.sel === 2) go('SENSOR', { sel: 0 }); else ui.emerg = !ui.emerg; }
  } else if (s === 'CANNED') {
    if (k === 'up' || k === 'down') ui.sel = vstep(ui.sel, k, CANNED.length);
    else if (k === 'left') go('COMPOSE', { sel: 0 }); else if (k === 'center') { sendMsg(CANNED[ui.sel], ui.emerg); go('MSGS'); }
  } else if (s === 'SENSOR') {
    if (k === 'up' || k === 'down') ui.sel = vstep(ui.sel, k, 4);
    else if (k === 'left') go('COMPOSE', { sel: 0 }); else if (k === 'center') { sendMsg(sensorText(ui.sel), ui.emerg); go('MSGS'); }
  } else if (s === 'KEYB') kbKey(k);
  else if (s === 'COMPASS') { if (k === 'left' || k === 'center') go('MENU'); else if (k === 'right') { ui.calUntil = now() + 15000; ui.calX = [9, -9]; ui.calY = [9, -9]; go('CALIB'); } }
  else if (s === 'CALIB') { if (k === 'left') go('COMPASS'); }
  else if (s === 'GPS' || s === 'BATT' || s === 'SYS') { if (k === 'left' || k === 'center') go('MENU'); }
  else if (s === 'SETM') {
    n = SET_LABELS.length;
    if (k === 'up' || k === 'down') { ui.setSel = vstep(ui.setSel, k, n); if (ui.setSel < ui.setTop) ui.setTop = ui.setSel; if (ui.setSel >= ui.setTop + 7) ui.setTop = ui.setSel - 6; if (ui.setSel === 0) ui.setTop = 0; if (ui.setSel === n - 1) ui.setTop = Math.max(0, n - 7); }
    else if (k === 'left') go('MENU');
    else if (k === 'center') {
      var L = SET_LABELS[ui.setSel];
      if (L === 'Brightness') go('S_BRI'); else if (L === 'Backlight Timeout') { go('S_TMO', { listSel: TIMEOUTS.map(function (t) { return t[1]; }).indexOf(settings.blTimeout) }); }
      else if (L === 'Theme') go('S_THM', { listSel: settings.theme }); else if (L === 'Menu Style') go('S_MNU', { listSel: settings.menuStyle }); else if (L === 'Joystick') go('S_JOY', { listSel: settings.joy });
      else if (L === 'Call Sign') openKb('callsign', settings.callsign, 9, 'SETM'); else if (L === 'LoRa') go('S_LORA', { lora: 0 });
      else if (L === 'Buzzer') go('S_BUZ'); else if (L === 'Status LED') go('S_LED'); else if (L === 'GPS Privacy') go('S_GPSP'); else if (L === 'Battery Alert') go('S_BATT');
      else if (L === 'Auto Shutdown') go('S_SHUT', { listSel: Math.max(0, SHUTV.indexOf(settings.shutdownV)), setTop: 0 }); else go('MENU');
    }
  } else setKeys(s, k);
  ui.dirty = true;
}
function setKeys(s, k) {
  function back() { go('SETM'); saveSettings(); }
  if (s === 'S_BRI') { if (k === 'left') settings.bl = Math.max(0, settings.bl - 5); else if (k === 'right') settings.bl = Math.min(100, settings.bl + 5); else if (k === 'center') back(); }
  else if (s === 'S_TMO') listKeys(k, TIMEOUTS.length, function (i) { settings.blTimeout = TIMEOUTS[i][1]; back(); }, 'SETM');
  else if (s === 'S_THM') { if (k === 'up' || k === 'down') { ui.listSel = vstep(ui.listSel, k, 3); settings.theme = ui.listSel; } else if (k === 'center' || k === 'left') back(); }
  else if (s === 'S_MNU') listKeys(k, 2, function (i) { settings.menuStyle = i; back(); }, 'SETM');
  else if (s === 'S_JOY') listKeys(k, 3, function (i) { settings.joy = i; back(); }, 'SETM');
  else if (s === 'S_LORA') {
    if (k === 'up' || k === 'down') ui.lora = vstep(ui.lora, k, 5); else if (k === 'left') back();
    else if (k === 'center') { if (ui.lora === 0) go('S_FRQ', { listSel: settings.freq }); else if (ui.lora === 1) go('S_PWR'); else if (ui.lora === 2) go('S_SF'); else if (ui.lora === 3) go('S_ENC'); else go('SETM'); }
  }
  else if (s === 'S_FRQ') listKeys(k, FREQS.length, function (i) { settings.freq = i; go('S_LORA'); saveSettings(); }, 'S_LORA');
  else if (s === 'S_PWR') { if (k === 'left') settings.pwr = Math.max(-9, settings.pwr - 1); else if (k === 'right') settings.pwr = Math.min(22, settings.pwr + 1); else if (k === 'center') { go('S_LORA'); saveSettings(); } }
  else if (s === 'S_SF') { if (k === 'left') settings.sf = Math.max(7, settings.sf - 1); else if (k === 'right') settings.sf = Math.min(12, settings.sf + 1); else if (k === 'center') { go('S_LORA'); saveSettings(); } }
  else if (s === 'S_ENC') { if (k === 'up' || k === 'down') settings.encOn = !settings.encOn; else if (k === 'left') go('S_LORA'); else if (k === 'center') openKb('key', settings.encKey, 31, 'S_ENC'); }
  else if (s === 'S_BUZ' || s === 'S_LED' || s === 'S_GPSP') {
    var f = s === 'S_BUZ' ? 'buzzOn' : s === 'S_LED' ? 'ledOn' : 'gpsInMsg';
    if (k === 'up' || k === 'down') settings[f] = !settings[f]; else if (k === 'center' || k === 'left') back();
  }
  else if (s === 'S_BATT') { if (k === 'up') settings.battAlertOn = !settings.battAlertOn; else if (k === 'left') settings.battThresh = Math.max(0, settings.battThresh - 5); else if (k === 'right') settings.battThresh = Math.min(95, settings.battThresh + 5); else if (k === 'center') back(); }
  else if (s === 'S_SHUT') listKeys(k, SHUTV.length, function (i) { settings.shutdownV = SHUTV[i]; back(); }, 'SETM');
}
function kbKey(k) {
  var rows = kbRows(), len = function (r) { return r === 4 ? 5 : rows[r].length; };
  if (k === 'up') { kb.row = (kb.row + 4) % 5; kb.col = Math.min(kb.col, len(kb.row) - 1); }
  else if (k === 'down') { kb.row = (kb.row + 1) % 5; kb.col = Math.min(kb.col, len(kb.row) - 1); }
  else if (k === 'left') kb.col = (kb.col + len(kb.row) - 1) % len(kb.row);
  else if (k === 'right') kb.col = (kb.col + 1) % len(kb.row);
  else if (k === 'center') {
    if (kb.row < 4) { if (kb.text.length < kb.max) kb.text += rows[kb.row][kb.col]; }
    else {
      var b = KB_BOTTOM[kb.col][0];
      if (b === 'mode') { kb.set = (kb.set + 1) % 3; kb.col = Math.min(kb.col, len(kb.row) - 1); }
      else if (b === 'SPACE') { if (kb.text.length < kb.max) kb.text += ' '; }
      else if (b === 'DEL') kb.text = kb.text.slice(0, -1);
      else if (b === 'X') go(kb.ret);
      else if (b === 'SEND') {
        if (kb.mode === 'compose') { if (kb.text.trim()) { sendMsg(kb.text, ui.emerg); go('MSGS'); } }
        else if (kb.mode === 'callsign') { if (kb.text.trim()) settings.callsign = kb.text.trim().slice(0, 9); saveSettings(); go('SETM'); }
        else { settings.encKey = kb.text; if (kb.text) settings.encOn = true; saveSettings(); go('S_ENC'); }
      }
    }
  }
}

/* ---------- styles ---------- */
var FSI = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>';
var css = '' +
'#lora-sim{--ba:#3ff2d6;--bd:rgba(255,255,255,.12);margin:28px 0;font-family:inherit;color:#e5edf5}' +
'#lora-sim *{box-sizing:border-box}' +
'html.has-custom-cursor #lora-sim *{cursor:none!important}' +
'html.has-custom-cursor #lora-sim.is-open *{cursor:auto!important}' +
'html.has-custom-cursor #lora-sim.is-open button,html.has-custom-cursor #lora-sim.is-open input,html.has-custom-cursor #lora-sim.is-open select{cursor:pointer!important}' +
'#lora-sim button,#lora-sim input,#lora-sim select{font:inherit;color:inherit}' +
'#lora-sim .ls{position:relative;outline:none;border:1px solid var(--bd);border-radius:18px;background:radial-gradient(120% 90% at 20% 0,rgba(63,242,214,.07),transparent 60%),rgba(8,12,18,.6)}' +
'#lora-sim .ls:focus-visible{box-shadow:0 0 0 2px var(--ba)}' +
'#lora-sim .ls-top,#lora-sim .ls-cta{display:none}' +
/* mini */
'#lora-sim .ls.mini{display:flex;align-items:center;gap:32px;padding:24px 28px}' +
'#lora-sim .ls.mini .ls-body{flex:none;width:200px;display:block}' +
'#lora-sim .ls.mini .ls-side,#lora-sim .ls.mini .ls-pad,#lora-sim .ls.mini .ls-big{display:none}' +
'#lora-sim .ls.mini .ls-stage{pointer-events:none;width:200px}' +
'#lora-sim .ls.mini .ls-cta{display:block;flex:1;min-width:0}' +
'#lora-sim .ls-cta h3{margin:0 0 8px;font-size:22px;line-height:1.2;color:#fff}' +
'#lora-sim .ls-cta p{margin:0 0 18px;color:#9fb0c1;font-size:15px;line-height:1.55;max-width:46ch}' +
'#lora-sim .ls-open{display:inline-flex;align-items:center;gap:10px;border:0;border-radius:999px;background:var(--ba);color:#04121a;font-weight:600;font-size:15px;padding:12px 20px;transition:transform .15s,box-shadow .2s}' +
'#lora-sim .ls-open:hover{transform:translateY(-1px);box-shadow:0 8px 26px rgba(63,242,214,.35)}' +
'#lora-sim .ls-open:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
'@media(max-width:640px){#lora-sim .ls.mini{flex-direction:column;gap:18px;padding:20px}#lora-sim .ls-cta{text-align:center}#lora-sim .ls-cta p{margin-left:auto;margin-right:auto}}' +
/* full */
'#lora-sim .ls.full{position:fixed;inset:0;z-index:2147483000;margin:0;border:0;border-radius:0;background:#05080c;padding:12px 22px 12px;display:flex;flex-direction:column}' +
'#lora-sim .ls.full .ls-top{display:flex;align-items:center;justify-content:space-between;position:absolute;top:12px;left:22px;right:22px;z-index:2;pointer-events:none;font-size:14px;color:#9fb0c1}#lora-sim .ls-top button{pointer-events:auto}' +
'#lora-sim .ls-top b{color:#fff;font-size:15px;letter-spacing:.02em}' +
'#lora-sim .ls-ghost{font-size:13px;color:#9fb0c1;background:none;border:1px solid var(--bd);border-radius:999px;padding:7px 14px;transition:.2s}' +
'#lora-sim .ls-ghost:hover{color:#fff;border-color:rgba(255,255,255,.4)}' +
'#lora-sim .ls.full .ls-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:26px}' +
'#lora-sim .ls-boardcol{overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px}' +
'#lora-sim .ls-stage{position:relative;width:min(100%,var(--lsw,700px));user-select:none;flex:none}' +
'#lora-sim .ls-svg{display:block;width:100%;height:auto;overflow:hidden;color:#e8eef4}' +
'#lora-sim .ls-tft{position:absolute;pointer-events:none;transition:opacity .3s;box-shadow:0 0 0 2px #000}' +
'#lora-sim .ls-b{position:absolute;background:transparent;border:0;border-radius:50%;padding:0;touch-action:none}' +
'#lora-sim .ls-b:hover{background:rgba(63,242,214,.05)}' +
'#lora-sim .ls-b:focus-visible,#lora-sim .ls-key:focus-visible,#lora-sim .ls-btn:focus-visible,#lora-sim .ls-seg button:focus-visible,#lora-sim input:focus-visible,#lora-sim select:focus-visible{outline:2px solid var(--ba)}' +
'#lora-sim .ls-side{overflow-y:auto;padding:44px 2px 0 0;scrollbar-width:thin}' +
'#lora-sim .ls-card{border:1px solid var(--bd);border-radius:16px;padding:16px 18px;background:rgba(255,255,255,.03);margin-bottom:14px}' +
'#lora-sim .ls-card h4{display:flex;align-items:center;justify-content:space-between;margin:0 0 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9fb0c1;font-weight:600}' +
'#lora-sim .ls-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:12px 0 0;font-size:13px;color:#b7c4d1}' +
'#lora-sim .ls-row>label:first-child,#lora-sim .ls-row>span:first-child{min-width:62px}' +
'#lora-sim .ls-row input[type=range]{flex:1 1 120px;min-width:100px;accent-color:#3ff2d6}' +
'#lora-sim .ls-row b{color:#fff;font-variant-numeric:tabular-nums;min-width:52px;text-align:right}' +
'#lora-sim select,#lora-sim input[type=text]{background:rgba(255,255,255,.05);border:1px solid var(--bd);border-radius:10px;padding:8px 10px;font-size:13px}' +
'#lora-sim select option{background:#0b1118;color:#e5edf5}' +
'#lora-sim input[type=text]{flex:1 1 140px;min-width:0}' +
'#lora-sim .ls-btn{border:1px solid var(--bd);background:rgba(255,255,255,.05);border-radius:999px;padding:8px 14px;font-size:13px;transition:.2s}' +
'#lora-sim .ls-btn:hover{border-color:rgba(63,242,214,.6)}' +
'#lora-sim .ls-btn.on{border-color:var(--ba);background:rgba(63,242,214,.14);color:#fff}' +
'#lora-sim .ls-btn.pri{background:var(--ba);color:#04121a;border-color:var(--ba);font-weight:600}' +
'#lora-sim .ls-btn.alert.on{border-color:#ff6b6b;background:rgba(255,107,107,.16)}' +
'#lora-sim .ls-seg{display:inline-flex;border:1px solid var(--bd);border-radius:999px;padding:3px;gap:2px;flex-wrap:wrap}' +
'#lora-sim .ls-seg button{border:0;background:transparent;border-radius:999px;padding:6px 12px;font-size:13px;color:#b7c4d1;transition:.2s}' +
'#lora-sim .ls-seg button.on{background:rgba(63,242,214,.18);color:#fff}' +
'#lora-sim .ls-step{display:inline-flex;align-items:center;gap:6px}#lora-sim .ls-step button{width:30px;height:30px;border-radius:50%;border:1px solid var(--bd);background:rgba(255,255,255,.05);font-size:16px;line-height:1}' +
'#lora-sim .ls-step b{min-width:46px;text-align:center}' +
'#lora-sim .ls-meter{display:flex;align-items:flex-end;gap:12px}#lora-sim .ls-bars{display:flex;align-items:flex-end;gap:3px;height:30px}#lora-sim .ls-bars i{width:7px;border-radius:2px;background:rgba(255,255,255,.14);transition:background .2s}' +
'#lora-sim .ls-bars i:nth-child(1){height:30%}#lora-sim .ls-bars i:nth-child(2){height:55%}#lora-sim .ls-bars i:nth-child(3){height:78%}#lora-sim .ls-bars i:nth-child(4){height:100%}' +
'#lora-sim .ls-big2{font-size:26px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;line-height:1}' +
'#lora-sim .ls-sub{font-size:12px;color:#8da0b3;margin-top:4px}' +
'#lora-sim .ls-pill{display:inline-block;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:600;border:1px solid currentColor;letter-spacing:0;text-transform:none}' +
'#lora-sim .ls-air{height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:12px}' +
'#lora-sim .ls-air i{display:block;height:100%;width:0;background:var(--ba)}#lora-sim .ls-air.tx i{background:#ff9a5a}' +
'#lora-sim .ls-airl{font-size:12px;color:#8da0b3;margin-top:5px;min-height:1.3em}#lora-sim .ls-airl.alarm{color:#ff8a8a;font-weight:600}' +
'#lora-sim .ls-log{margin:12px 0 0;padding:0;list-style:none;font-size:12px;line-height:1.4;color:#9fb0c1;min-height:1px}' +
'#lora-sim .ls-log li{padding:2px 0 2px 10px;border-left:2px solid rgba(255,255,255,.18);margin-bottom:3px}' +
'#lora-sim .ls-log li.rx{border-color:#3ff2d6;color:#d7fff7}#lora-sim .ls-log li.tx{border-color:#ff9a5a}#lora-sim .ls-log li.bad{border-color:#ff6b6b;color:#ffb3b3}' +
'#lora-sim .ls-pad,#lora-sim .ls-big{display:none}' +
'@media(max-width:900px){#lora-sim .ls.full{overflow-y:auto;padding-top:56px}#lora-sim .ls-side{padding-top:0}#lora-sim .ls.full .ls-body{display:block;flex:none}#lora-sim .ls-boardcol{overflow:visible}#lora-sim .ls-side{overflow:visible;margin-top:16px}#lora-sim .ls.full .ls-big{display:block;width:100%;max-width:700px;border-radius:6px;background:#000;box-shadow:0 0 0 2px #222}#lora-sim .ls.full .ls-pad{display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,52px);gap:5px}}' +
'#lora-sim .ls-key{border:1px solid var(--bd);background:rgba(255,255,255,.04);border-radius:12px;font-size:18px;touch-action:none}#lora-sim .ls-key.dn{background:rgba(63,242,214,.22);border-color:var(--ba)}' +
'#lora-sim .ls-arc{fill:none;stroke:currentColor;stroke-width:2.4;opacity:0}' +
'#lora-sim .ls-fx.on .ls-arc{animation:lsarc 1s ease-out infinite}#lora-sim .ls-fx.on .a2{animation-delay:.25s}#lora-sim .ls-fx.on .a3{animation-delay:.5s}' +
'@keyframes lsarc{0%{opacity:.9;transform:scale(.55)}100%{opacity:0;transform:scale(1.15)}}' +
'#lora-sim .ls-fx .ls-arc,#lora-sim .ls-buzz{transform-box:fill-box;transform-origin:center}' +
'#lora-sim .ls-buzz{fill:none;stroke:#ffb020;stroke-width:2;opacity:0}#lora-sim .ls-buzz.on{animation:lsbz .35s ease-out infinite}' +
'@keyframes lsbz{0%{opacity:.9;transform:scale(.7)}100%{opacity:0;transform:scale(1.3)}}' +
'#lora-sim #ls-alring{fill:none;stroke:#ff4d4d;stroke-width:4;opacity:0}#lora-sim #ls-alring.on{animation:lsal .7s ease-in-out infinite}' +
'@keyframes lsal{0%,100%{opacity:.15}50%{opacity:1}}' +
'#lora-sim #ls-plug{transition:transform .7s cubic-bezier(.3,.7,.2,1),opacity .6s}#lora-sim #ls-sw1,#lora-sim #ls-sw2{transition:transform .25s cubic-bezier(.3,.7,.2,1)}#lora-sim #ls-stick *{transition:transform .08s}' +
'@media (prefers-reduced-motion:reduce){#lora-sim #ls-plug,#lora-sim #ls-sw1,#lora-sim #ls-sw2{transition:none}#lora-sim .ls-fx.on .ls-arc,#lora-sim .ls-buzz.on,#lora-sim #ls-alring.on{animation:none;opacity:.7}}' +
'#lora-sim .ls-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}';
var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

/* ---------- markup ---------- */
var VBX = '0 -170 720 1170';
root.innerHTML = '' +
'<div class="ls mini" tabindex="0" role="group" aria-label="LoRa messenger simulator. Arrow keys move the joystick, Enter selects.">' +
' <div class="ls-top"><b>LoRa Portable Messenger</b><button class="ls-ghost" id="ls-close" type="button">Close</button></div>' +
' <div class="ls-body">' +
'  <div class="ls-boardcol" id="ls-bcol">' +
'   <div class="ls-stage"><svg class="ls-svg" id="ls-svg" viewBox="' + VBX + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="LoRa Radio v1 board">' +
'    <g id="ls-art">' + ART + '</g><g id="ls-ext"></g></svg>' +
'    <canvas class="ls-tft" id="ls-tft" width="960" height="720" aria-hidden="true"></canvas>' +
'    <button class="ls-b" id="ls-joy" type="button" aria-label="5-way joystick: click above, below, left or right, or drag. Click the middle to select." title="Joystick: click or drag in any direction, middle to select"></button>' +
'    <button class="ls-b" id="ls-pwr" type="button" style="border-radius:8px" aria-label="Power slide switch" title="Power switch"></button>' +
'   </div>' +
'   <canvas class="ls-big" id="ls-big" width="960" height="720" aria-hidden="true"></canvas>' +
'   <div class="ls-pad" role="group" aria-label="Joystick buttons">' +
'    <span></span><button class="ls-key" data-k="up" aria-label="Up" type="button">&#9650;</button><span></span>' +
'    <button class="ls-key" data-k="left" aria-label="Left" type="button">&#9664;</button><button class="ls-key" data-k="center" aria-label="Select" type="button">&#9679;</button><button class="ls-key" data-k="right" aria-label="Right" type="button">&#9654;</button>' +
'    <span></span><button class="ls-key" data-k="down" aria-label="Down" type="button">&#9660;</button><span></span>' +
'   </div>' +
'  </div>' +
'  <div class="ls-side">' +
'   <div class="ls-card"><h4>Other radio <span id="ls-verd" class="ls-pill"></span></h4>' +
'    <div class="ls-meter"><div class="ls-bars" id="ls-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div><div class="ls-big2" id="ls-rssi"></div><div class="ls-sub"><span id="ls-snr"></span> &middot; <span id="ls-airt"></span></div></div></div>' +
'    <div class="ls-row"><label for="ls-dist">Distance</label><input id="ls-dist" type="range" min="0" max="1000" value="400"><b id="ls-distv"></b></div>' +
'    <div class="ls-row"><span>Area</span><span class="ls-seg" id="ls-env" role="group" aria-label="Surroundings"></span></div>' +
'    <div class="ls-row"><span>Its settings</span><span class="ls-step"><button type="button" id="ls-sfm" aria-label="Lower spreading factor">&minus;</button><b id="ls-sfv"></b><button type="button" id="ls-sfp" aria-label="Raise spreading factor">+</button></span><select id="ls-rfq" aria-label="Its frequency"></select><button id="ls-match" class="ls-pill" type="button" style="background:none;cursor:pointer" title="Make its settings match yours"></button></div>' +
'    <div class="ls-row"><input id="ls-rtxt" type="text" maxlength="170" placeholder="Type a message" aria-label="Message from the other radio"><button class="ls-btn pri" id="ls-rsend" type="button">Send</button></div>' +
'    <div class="ls-row" style="margin-top:8px"><button class="ls-btn alert" id="ls-remerg" type="button" aria-pressed="false">Emergency</button><button class="ls-btn" id="ls-renc" type="button" aria-pressed="false" title="Key: koda">Encrypted</button><button class="ls-btn on" id="ls-rauto" type="button" aria-pressed="true">Auto-reply</button></div>' +
'    <div class="ls-air" id="ls-air"><i></i></div><div class="ls-airl" id="ls-airl">Idle</div>' +
'    <ul class="ls-log" id="ls-log" aria-live="polite"></ul>' +
'   </div>' +
'   <div class="ls-card"><h4>Your device</h4>' +
'    <div class="ls-row" style="margin-top:0"><button class="ls-btn on" id="ls-bpwr" type="button">Power</button><button class="ls-btn" id="ls-busb" type="button">USB-C</button><button class="ls-btn on" id="ls-bsnd" type="button">Sound</button></div>' +
'    <div class="ls-row"><label for="ls-batt">Battery</label><input id="ls-batt" type="range" min="0" max="100" value="82"><b id="ls-battv"></b></div>' +
'    <div class="ls-row"><span>GPS</span><span class="ls-seg" id="ls-sky" role="group" aria-label="GPS reception"><button type="button" data-v="1" class="on">Open sky</button><button type="button" data-v="0">Indoors</button></span></div>' +
'    <div class="ls-row"><label for="ls-head">Facing</label><input id="ls-head" type="range" min="0" max="359" value="40"><b id="ls-headv"></b><button class="ls-btn" id="ls-spin" type="button" aria-pressed="false">Spin</button></div>' +
'   </div>' +
'  </div>' +
' </div>' +
' <div class="ls-cta"><h3>Try the LoRa Messenger yourself</h3><p>Browse the menus, send a message, then drag a second radio away and watch the signal fade until your messages stop arriving.</p><button class="ls-open" id="ls-open" type="button">' + FSI + 'Open simulator</button></div>' +
' <div class="ls-sr" id="ls-sr" aria-live="polite"></div>' +
'</div>';
var q = function (s) { return root.querySelector(s); };
var svg = q('#ls-svg'), ext = q('#ls-ext'), widget = q('.ls'), stage = q('.ls-stage'), bcol = q('#ls-bcol');
cv = q('#ls-tft'); g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.scale(SC, SC);
var gid = function (id) { return svg.querySelector('#' + id); };

/* ---------- extra drawing: antenna, plug, 18650, effects ---------- */
function rp(pts, r) {
  var d = 'M' + pts[0][0] + ' ' + pts[0][1];
  for (var i = 1; i < pts.length - 1; i++) {
    var a = pts[i - 1], b = pts[i], c = pts[i + 1], l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]), rr = Math.min(r, l1 / 2, l2 / 2);
    var p1 = [b[0] + (a[0] - b[0]) / l1 * rr, b[1] + (a[1] - b[1]) / l1 * rr], p2 = [b[0] + (c[0] - b[0]) / l2 * rr, b[1] + (c[1] - b[1]) / l2 * rr];
    d += ' L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' Q' + b[0] + ' ' + b[1] + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  var e = pts[pts.length - 1]; return d + ' L' + e[0] + ' ' + e[1];
}
(function () {
  var s = 'stroke="#e8eef4" stroke-width="2" fill="none" stroke-linejoin="round" stroke-linecap="round"', ribs = '';
  for (var y = -92; y > -142; y -= 16) ribs += '<path d="M14 ' + y + ' H103" stroke-opacity=".3"/>';
  ext.innerHTML = '' +
  /* SMA connector (threaded barrel, nut) + rubber-duck antenna */
  '<g ' + s + '><rect x="31.7" y="-60" width="54" height="66" fill="rgba(5,8,12,.9)"/><path d="M31.7 -46 H85.7 M31.7 -32 H85.7 M31.7 -18 H85.7 M31.7 -4 H85.7" stroke-opacity=".3"/>' +
  '<rect x="22" y="-76" width="73" height="16" rx="3" fill="rgba(5,8,12,.9)"/>' +
  '<path d="M12 -76 V-118 Q12 -154 58.7 -154 Q105.4 -154 105.4 -118 V-76 Z" fill="rgba(255,255,255,.04)"/>' + ribs + '</g>' +
  '<g class="ls-fx" id="ls-fx" style="color:#3ff2d6"><circle class="ls-arc" cx="58.7" cy="-130" r="26"/><circle class="ls-arc a2" cx="58.7" cy="-130" r="40"/><circle class="ls-arc a3" cx="58.7" cy="-130" r="54"/></g>' +
  '<circle class="ls-buzz" id="ls-bz1" cx="307" cy="618" r="26"/><circle class="ls-buzz" id="ls-bz2" cx="307" cy="618" r="40" style="animation-delay:.12s"/>' +
  '<text id="ls-pwrtxt" x="573.6" y="224" text-anchor="middle" font-size="12" font-weight="600" fill="#3ddc84" stroke="none" font-family="Inter,Arial,sans-serif">ON</text>' +
  '<g ' + s + '><rect id="ls-sw2" x="564" y="140" width="19" height="26" rx="3" fill="rgba(63,242,214,.25)" stroke-opacity=".6"/></g>' +
  /* wires + 18650 cell (to the right of the board) */
  '<g ' + s + '><path d="' + rp([[566, 862], [606, 862], [606, 732], [651, 732], [651, 754]], 14) + '" stroke="#ff6b6b" stroke-width="3"/><path d="' + rp([[566, 892], [566, 978], [651, 978], [651, 948]], 14) + '" stroke="#9aa7b4" stroke-width="3"/>' +
  '<rect x="626" y="762" width="50" height="186" rx="14" fill="rgba(5,8,12,.92)"/><rect x="643" y="752" width="16" height="10" rx="2" fill="rgba(5,8,12,.92)"/>' +
  '<path d="M628 782 H674 M628 928 H674" stroke-opacity=".35"/>' +
  '<text transform="rotate(-90 648 858)" x="648" y="858" text-anchor="middle" font-size="16" font-weight="600" fill="#e8eef4" stroke="none" font-family="Inter,Arial,sans-serif">18650</text><text transform="rotate(-90 664 858)" x="664" y="858" text-anchor="middle" font-size="9" fill="#e8eef4" fill-opacity=".6" stroke="none" font-family="Inter,Arial,sans-serif">3.7 V Li-ion</text>' +
  '<text x="676" y="750" font-size="13" fill="#ff6b6b" stroke="none" font-family="Inter,Arial,sans-serif">+</text><text x="676" y="972" font-size="15" fill="#9aa7b4" stroke="none" font-family="Inter,Arial,sans-serif">\u2212</text></g>' +
  /* usb plug */
  '<g id="ls-plug" style="transform:translateY(60px)"><g ' + s + '><rect x="262" y="906" width="76" height="26" rx="6" fill="rgba(5,8,12,.92)"/><rect x="274" y="914" width="52" height="10" rx="3" stroke-opacity=".35"/><rect x="250" y="932" width="100" height="46" rx="10" fill="rgba(5,8,12,.92)"/><path d="M300 978 V1000"/></g></g>' +
  '<rect id="ls-plughit" x="240" y="930" width="120" height="70" fill="transparent" style="cursor:pointer"/>';
  var bz = gid('tft-bezel'); if (bz) { var bb = bz.getBBox(); var r = el('rect', { id: 'ls-alring', x: bb.x - 8, y: bb.y - 8, width: bb.width + 16, height: bb.height + 16, rx: 6 }, ext); }
  var kn = gid('power-switch'); if (kn) { var rs = kn.querySelectorAll('rect'); if (rs[1]) rs[1].setAttribute('id', 'ls-sw1'); }
  var st = gid('btn-1'); if (st) { var grp = el('g', { id: 'ls-stick' }, st); while (st.children.length > 2) grp.appendChild(st.children[1]); }
})();
var plugEl = gid('ls-plug'), sw1 = gid('ls-sw1'), sw2 = gid('ls-sw2'), stickEl = gid('ls-stick');
function tilt(k) { if (!stickEl) return; var o = { up: [0, -7], down: [0, 7], left: [-7, 0], right: [7, 0], center: [0, 0] }[k] || [0, 0]; stickEl.style.transform = 'translate(' + o[0] + 'px,' + o[1] + 'px)'; stickEl.style.transition = 'transform .08s'; if (k === 'center') setTimeout(function () { stickEl.style.transform = ''; }, 90); }

/* ---------- layout ---------- */
function place(elm, target, pad) {
  var sr = stage.getBoundingClientRect(), r = target.getBoundingClientRect();
  elm.style.left = (r.left - sr.left - pad) + 'px'; elm.style.top = (r.top - sr.top - pad) + 'px';
  elm.style.width = (r.width + pad * 2) + 'px'; elm.style.height = (r.height + pad * 2) + 'px';
}
function layout() {
  var t = gid('tft-display'), j = gid('btn-1'), p = gid('power-switch'); if (!t || !stage.offsetWidth) return;
  var sc = stage.getBoundingClientRect().width / 720;
  place(cv, t, 0); place(q('#ls-joy'), j, 38 * sc); place(q('#ls-pwr'), p, 6);
}
if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
window.addEventListener('load', layout); window.addEventListener('resize', layout);

/* ---------- input ---------- */
var rep = { t: 0, i: 0 };
function dirDown(k) { key(k); updateUi(); clearTimeout(rep.t); clearInterval(rep.i); if (k !== 'center') rep.t = setTimeout(function () { rep.i = setInterval(function () { key(k); }, 140); }, 450); }
function dirUp() { clearTimeout(rep.t); clearInterval(rep.i); }
Array.prototype.forEach.call(root.querySelectorAll('.ls-key'), function (b) {
  b.addEventListener('pointerdown', function (e) { e.preventDefault(); b.classList.add('dn'); dirDown(b.getAttribute('data-k')); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { b.classList.remove('dn'); dirUp(); }); });
});
var joy = q('#ls-joy'), jy = { zone: null, pending: false };
function zoneAt(e) {
  var r = joy.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.15) return 'center';
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
joy.addEventListener('pointerdown', function (e) {
  e.preventDefault(); try { joy.setPointerCapture(e.pointerId); } catch (x) { }
  var z = zoneAt(e); jy.zone = z; jy.pending = z === 'center'; tilt(z === 'center' ? 'center' : z);
  if (!jy.pending) dirDown(z); widget.focus({ preventScroll: true });
});
joy.addEventListener('pointermove', function (e) {
  if (jy.zone === null) return; var z = zoneAt(e); if (z === jy.zone) return;
  dirUp(); jy.pending = false; jy.zone = z; tilt(z); if (z !== 'center') dirDown(z);
});
function joyEnd() { if (jy.zone === null) return; if (jy.pending) { key('center'); updateUi(); } dirUp(); jy.zone = null; jy.pending = false; tilt(null); }
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { joy.addEventListener(ev, joyEnd); });
joy.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
widget.addEventListener('keydown', function (e) {
  if (e.target !== widget && e.target !== joy) return;
  var m = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'center', ' ': 'center' }[e.key];
  if (ui.scr === 'KEYB' && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey) { if (kb.text.length < kb.max) { kb.text += e.key; wake(); ui.dirty = true; } e.preventDefault(); return; }
  if (ui.scr === 'KEYB' && e.key === 'Backspace') { kb.text = kb.text.slice(0, -1); wake(); ui.dirty = true; e.preventDefault(); return; }
  if (ui.scr === 'KEYB' && e.key === ' ') { if (kb.text.length < kb.max) kb.text += ' '; wake(); ui.dirty = true; e.preventDefault(); return; }
  if (m) { e.preventDefault(); tilt(m); setTimeout(function () { tilt('center'); }, 120); key(m); updateUi(); }
});

/* ---------- power / usb ---------- */
function powerOn() {
  var t = now(); dev.on = true; dev.asleep = false; dev.bootAt = t; dev.lastInput = t; dev.lowFired = false;
  msgs = []; gps.fix = false; gps.sats = 0; gps.since = t; gps.nmea = []; stopAlarm(); dev.lastRssi = dev.lastSnr = null; dev.txUntil = 0;
  go('BOOT', { msel: 0 }); ui.bootT = t;
}
function powerOff() { dev.on = false; stopAlarm(); ui.dirty = true; }
function togglePower() { if (dev.on && !dev.asleep) powerOff(); else powerOn(); updateUi(); }
function toggleUsb() { dev.usb = !dev.usb; updateUi(); }
q('#ls-pwr').addEventListener('click', togglePower);
q('#ls-bpwr').addEventListener('click', togglePower);
q('#ls-busb').addEventListener('click', toggleUsb);
q('#ls-plughit').addEventListener('click', toggleUsb);
q('#ls-bsnd').addEventListener('click', function () { dev.sound = !dev.sound; if (!dev.sound) stopAlarmSound(); else try { actx && actx.resume(); } catch (e) { } updateUi(); });
function stopAlarmSound() { if (alarmOsc) { try { alarmOsc.stop(); } catch (e) { } alarmOsc = null; clearInterval(alarmIv); } }

/* ---------- side panel ---------- */
var envSeg = q('#ls-env'), rfq = q('#ls-rfq');
ENVS.forEach(function (e, i) { var b = document.createElement('button'); b.type = 'button'; b.textContent = ['Open', 'Suburban', 'Urban'][i]; b.setAttribute('data-v', i); b.onclick = function () { remote.env = i; updateUi(); }; envSeg.appendChild(b); });
FREQS.forEach(function (f, i) { var o = document.createElement('option'); o.value = i; o.textContent = f[0]; rfq.appendChild(o); });
function distFromSlider(v) { return Math.round(Math.pow(10, Math.log10(0.05) + (Math.log10(20) - Math.log10(0.05)) * v / 1000) * 100) / 100; }
function sliderFromDist(d) { return Math.round((Math.log10(d) - Math.log10(0.05)) / (Math.log10(20) - Math.log10(0.05)) * 1000); }
q('#ls-dist').value = sliderFromDist(remote.dist);
q('#ls-dist').oninput = function () { remote.dist = distFromSlider(+this.value); updateUi(); };
q('#ls-sfm').onclick = function () { remote.follow = false; remote.sf = Math.max(7, remote.sf - 1); updateUi(); };
q('#ls-sfp').onclick = function () { remote.follow = false; remote.sf = Math.min(12, remote.sf + 1); updateUi(); };
rfq.onchange = function () { remote.follow = false; remote.freq = +rfq.value; updateUi(); };
q('#ls-match').onclick = function () { remote.follow = true; updateUi(); };
function toggleChip(id, f) { var b = q(id); b.onclick = function () { remote[f] = !remote[f]; b.classList.toggle('on', remote[f]); b.setAttribute('aria-pressed', remote[f]); }; }
toggleChip('#ls-rauto', 'auto'); toggleChip('#ls-renc', 'enc');
var remEmerg = false; q('#ls-remerg').onclick = function () { remEmerg = !remEmerg; this.classList.toggle('on', remEmerg); this.setAttribute('aria-pressed', remEmerg); };
q('#ls-rsend').onclick = function () { var t = q('#ls-rtxt'); var v = t.value.trim() || (remEmerg ? 'EMERGENCY, need help' : 'Testing, can you hear me?'); remoteSend(v, remEmerg); t.value = ''; };
q('#ls-rtxt').addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') q('#ls-rsend').click(); });
q('#ls-batt').oninput = function () { dev.pct = +this.value; dev.lowFired = dev.pct < settings.battThresh; updateUi(); };
Array.prototype.forEach.call(q('#ls-sky').children, function (b) { b.onclick = function () { dev.sky = b.getAttribute('data-v') === '1'; updateUi(); }; });
q('#ls-head').oninput = function () { dev.heading = +this.value; updateUi(); };
q('#ls-spin').onclick = function () { dev.spin = !dev.spin; updateUi(); };
var cache = {};
function setT(id, v) { if (cache[id] !== v) { cache[id] = v; var e = q('#' + id); if (e) e.textContent = v; } }
function updateUi() {
  if (remote.follow) { remote.sf = settings.sf; remote.freq = settings.freq; }
  var d = remote.dist; setT('ls-distv', d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(d < 10 ? 2 : 1) + ' km');
  var lk = linkMean(settings.pwr, settings.sf), snr = Math.min(12, lk.rssi - noiseFloor()), mar = lk.rssi - lk.sens, ok = compat();
  setT('ls-rssi', Math.round(lk.rssi) + ' dBm'); setT('ls-snr', 'SNR ' + snr.toFixed(0) + ' dB');
  setT('ls-airt', (airtime(settings.sf, 38) / 1000).toFixed(2) + ' s per message');
  var txt, c, bars; if (!ok) { txt = 'Settings differ'; c = '#ff9a5a'; bars = 0; } else if (mar < 0) { txt = 'No link'; c = '#ff6b6b'; bars = 0; } else if (mar < 4) { txt = 'Marginal'; c = '#ffd166'; bars = 1; } else if (mar < 10) { txt = 'Good'; c = '#9be28a'; bars = 2; } else if (mar < 20) { txt = 'Strong'; c = '#3ff2d6'; bars = 3; } else { txt = 'Excellent'; c = '#3ff2d6'; bars = 4; }
  setT('ls-verd', txt); q('#ls-verd').style.color = c;
  Array.prototype.forEach.call(q('#ls-bars').children, function (b, i) { b.style.background = i < bars ? c : ''; });
  setT('ls-sfv', 'SF' + remote.sf); rfq.value = remote.freq;
  var mt = q('#ls-match'); setT('ls-match', ok ? 'Same as yours' : 'Tap to match yours'); mt.style.color = ok ? '#9be28a' : '#ff9a5a';
  Array.prototype.forEach.call(envSeg.children, function (b, i) { b.classList.toggle('on', i === remote.env); });
  Array.prototype.forEach.call(q('#ls-sky').children, function (b) { b.classList.toggle('on', (b.getAttribute('data-v') === '1') === dev.sky); });
  setT('ls-battv', Math.round(dev.pct) + '%'); setT('ls-headv', Math.round(dev.heading) + '°');
  var pw = dev.on && !dev.asleep;
  q('#ls-bpwr').classList.toggle('on', pw); setT('ls-bpwr', pw ? 'Power on' : 'Power off');
  q('#ls-busb').classList.toggle('on', dev.usb); setT('ls-busb', dev.usb ? 'USB-C plugged in' : 'USB-C unplugged');
  q('#ls-bsnd').classList.toggle('on', dev.sound); setT('ls-bsnd', dev.sound ? 'Sound on' : 'Sound off');
  q('#ls-spin').classList.toggle('on', dev.spin); q('#ls-spin').setAttribute('aria-pressed', dev.spin);
  setT('ls-pwrtxt', pw ? 'ON' : 'OFF'); var pt = q('#ls-pwrtxt'); if (pt) pt.setAttribute('fill', pw ? '#3ddc84' : '#8da0b3');
  var tr = 'translateY(' + (pw ? -20 : 20) + 'px)'; if (sw1) sw1.style.transform = tr; if (sw2) sw2.style.transform = tr;
  if (plugEl) { plugEl.style.transform = 'translateY(' + (dev.usb ? 0 : 50) + 'px)'; plugEl.style.opacity = dev.usb ? 1 : 0.0; }
  if (logDirty) { logDirty = false; q('#ls-log').innerHTML = rlog.slice(-3).map(function (r) { return '<li class="' + r.c + '">' + r.h + '</li>'; }).join(''); }
}

/* ---------- fullscreen ---------- */
var isFull = false, fb = false, fbPh = null, fbH = 0;
function fitStage() { var H = window.innerHeight, W = window.innerWidth; var w = W <= 900 ? 2000 : Math.min((H - 30) * (720 / 1170), (bcol.clientWidth || 700)); stage.style.setProperty('--lsw', Math.round(w) + 'px'); }
function setFull(on) {
  isFull = on; widget.classList.toggle('full', on); widget.classList.toggle('mini', !on); root.classList.toggle('is-open', on);
  if (on) { widget.focus({ preventScroll: true }); fitStage(); }
  var f = function () { if (on) fitStage(); layout(); ui.dirty = true; };
  requestAnimationFrame(function () { f(); requestAnimationFrame(f); }); setTimeout(f, 200);
  updateUi();
}
function toFallback() { if (fb || !isFull) return; fb = true; fbPh = document.createElement('div'); fbPh.style.height = fbH + 'px'; root.parentNode.insertBefore(fbPh, root); document.body.appendChild(root); document.documentElement.style.overflow = 'hidden'; }
function openFull() {
  fbH = root.offsetHeight; var rq = widget.requestFullscreen || widget.webkitRequestFullscreen; setFull(true);
  if (rq) { try { var r = rq.call(widget); if (r && r.catch) r.catch(toFallback); } catch (e) { toFallback(); } } else toFallback();
  run();
}
function endFull() { if (!isFull) return; setFull(false); if (fb) { fb = false; fbPh.parentNode.insertBefore(root, fbPh); fbPh.parentNode.removeChild(fbPh); document.documentElement.style.overflow = ''; } }
function closeFull() { var fe = document.fullscreenElement || document.webkitFullscreenElement; if (fe === widget) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else endFull(); }
['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) { document.addEventListener(ev, function () { if (isFull && !fb && !(document.fullscreenElement || document.webkitFullscreenElement)) endFull(); else if (isFull) { fitStage(); setTimeout(layout, 100); } }); });
document.addEventListener('keydown', function (e) { if (isFull && fb && e.key === 'Escape') closeFull(); });
window.addEventListener('resize', function () { if (isFull) fitStage(); });
q('#ls-open').onclick = openFull; q('#ls-close').onclick = closeFull;

/* ---------- simulation loop ---------- */
var last = now(), lastDraw = 0, lastBatt = 0, lastNmea = 0, lastSr = 0, raf = 0, visible = true;
function periodFor(s) { return s === 'KEYB' ? 250 : (s === 'COMPASS' || s === 'CALIB') ? 100 : s === 'GPS' ? 500 : s === 'BATT' ? 7000 : 1000; }
function step(t, dt) {
  if (dev.on && !dev.asleep) {
    /* boot splash */
    if (ui.scr === 'BOOT' && t - ui.bootT > 900) go('MENU');
    /* gps */
    if (dev.sky) { if (t - gps.since > 10000) { gps.fix = true; } if (gps.fix) gps.sats = clamp(Math.round(9 + Math.sin(t / 9000) * 2 + gauss() * 0.01), 6, 12); else gps.sats = Math.min(5, Math.floor((t - gps.since) / 2000)); }
    else { gps.fix = false; gps.sats = 0; gps.since = t; }
    if (gps.fix) { gps.alt += gauss() * 0.01; }
    /* heading */
    if (dev.spin) { dev.heading = (dev.heading + dt * 0.06) % 360; var hs = q('#ls-head'); if (hs) hs.value = Math.round(dev.heading); }
    /* env */
    dev.tempC = 24.6 + Math.sin(t / 60000) * 0.4; dev.hum = 48 + Math.sin(t / 45000) * 2;
    /* battery */
    var net = chargeMa() - drawMa(), tgt = net / CAP_MAH * 100;
    dev.rate += (tgt - dev.rate) * Math.min(1, dt / 2000);
    dev.pct = clamp(dev.pct + net / CAP_MAH * 100 * dt / 3600000, 0, 100);
    if (!dev.lowFired && settings.battAlertOn && dev.pct < settings.battThresh) { dev.lowFired = true; sndLow(); }
    if (dev.lowFired && dev.pct > settings.battThresh + 3) dev.lowFired = false;
    var bs = q('#ls-batt'); if (bs && cache.bl !== Math.round(dev.pct)) { cache.bl = Math.round(dev.pct); if (document.activeElement !== bs) bs.value = cache.bl; }
    if (settings.shutdownV > 0 && !dev.usb && battV() < settings.shutdownV && ui.scr !== 'SHUT') { go('SHUT'); ui.shutT = t; stopAlarm(); }
    if (ui.scr === 'SHUT' && t - ui.shutT > 2400) { dev.asleep = true; ui.dirty = true; }
    /* calibration */
    if (ui.scr === 'CALIB') {
      var m = rawMag(); ui.calX = [Math.min(ui.calX[0], m.x), Math.max(ui.calX[1], m.x)]; ui.calY = [Math.min(ui.calY[0], m.y), Math.max(ui.calY[1], m.y)];
      if (t > ui.calUntil) {
        var ok = ui.calX[1] - ui.calX[0] > 0.4 && ui.calY[1] - ui.calY[0] > 0.4;
        if (ok) { settings.compOff = { x: (ui.calX[0] + ui.calX[1]) / 2, y: (ui.calY[0] + ui.calY[1]) / 2 }; saveSettings(); }
        ui.calMsg = ok ? 'Calibration saved!' : 'Calibration failed'; ui.calMsgUntil = t + 1800; go('COMPASS');
        setTimeout(function () { ui.dirty = true; }, 1850);
      }
    }
    if (t - lastNmea > 1000) { lastNmea = t; nmeaNext(); }
  }
  /* alarm silenced when the device goes off */
  if (!dev.on || dev.asleep) stopAlarm();
}
var bigc = q('#ls-big'), bigg = bigc.getContext('2d');
function bigDraw() { if (bigc.offsetParent) bigg.drawImage(cv, 0, 0); }
function frame() {
  raf = requestAnimationFrame(frame);
  var t = now(), dt = Math.min(200, t - last); last = t;
  step(t, dt);
  var lvl = backlightLevel(); var o = lvl.toFixed(2); if (cache.op !== o) { cache.op = o; cv.style.opacity = o; bigc.style.opacity = o; }
  if (ui.dirty || t - lastDraw > periodFor(ui.scr)) { lastDraw = t; ui.dirty = false; renderTft(); bigDraw(); }
  var fx = q('#ls-fx'), on = t < onAir.until; fx.setAttribute('class', 'ls-fx' + (on ? ' on' : '')); fx.style.color = onAir.kind === 'tx' ? '#ff9a5a' : '#3ff2d6';
  var bz = t < buzzUntil || alarm.on; q('#ls-bz1').setAttribute('class', 'ls-buzz' + (bz ? ' on' : '')); q('#ls-bz2').setAttribute('class', 'ls-buzz' + (bz ? ' on' : ''));
  var air = q('#ls-air'), ai = air.firstChild;
  if (on) { var tot = onAir.until - (onAir.start || (onAir.start = onAir.until - 1)); }
  var w = on ? Math.round(100 - (onAir.until - t) / Math.max(1, onAir.dur) * 100) : 0;
  if (ai && cache.aw !== w) { cache.aw = w; ai.style.width = w + '%'; }
  air.className = 'ls-air' + (onAir.kind === 'tx' ? ' tx' : '');
  var al = q('#ls-airl'); al.className = 'ls-airl' + (alarm.on ? ' alarm' : ''); var ar = gid('ls-alring'); if (ar) ar.setAttribute('class', alarm.on ? 'on' : '');
  setT('ls-airl', on ? onAir.label + ', ' + Math.max(0, Math.round(onAir.until - t)) + ' ms left' : (alarm.on ? 'Emergency alarm on your device' : 'Idle'));
  if (t - lastBatt > 500) { lastBatt = t; updateUi(); }
  if (logDirty) updateUi();
  if (t - lastSr > 3000) { lastSr = t; q('#ls-sr').textContent = 'Screen: ' + ui.scr; }
}
function run() { if (!raf && visible && !document.hidden) { last = now(); raf = requestAnimationFrame(frame); } }
function halt() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
if (window.IntersectionObserver) new IntersectionObserver(function (e) { visible = e[0].isIntersecting; visible ? run() : halt(); }, { rootMargin: '120px' }).observe(root);
document.addEventListener('visibilitychange', function () { document.hidden ? halt() : run(); });

/* ---------- start ---------- */
setTimeout(function () { layout(); powerOn(); updateUi(); run(); }, 0);
root.__lora = {
  key: function (k) { key(k); }, go: go, ui: ui, settings: settings, dev: dev, msgs: function () { return msgs; }, gps: gps, kb: kb,
  send: sendMsg, remoteSend: remoteSend, remote: remote, airtime: airtime, power: togglePower, usb: toggleUsb, scr: function () { return ui.scr; },
  now: function () { return dev.txUntil; }
};
})();

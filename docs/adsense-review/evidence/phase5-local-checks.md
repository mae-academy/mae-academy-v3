## UA parity (after build, local Vercel emulator) — sha256 of body per UA
| `/` | 793a262f1492 | 793a262f1492 | 793a262f1492 | 793a262f1492 |
| `/simulations/control-systems/pid` | beece5561c8b | beece5561c8b | beece5561c8b | beece5561c8b |
| `/privacy` | 4576ae090fdf | 4576ae090fdf | 4576ae090fdf | 4576ae090fdf |
| `/library/ia:x` | a01ee4bf6d8b | a01ee4bf6d8b | a01ee4bf6d8b | a01ee4bf6d8b |

## Every sitemap <loc> on the after build
| `/` | 200 | https://maeacademy.org/ | /index.html |
| `/simulations` | 200 | https://maeacademy.org/simulations | /prerendered/simulations.html |
| `/simulations/plc` | 200 | — | /prerendered/simulations/plc.html |
| `/simulations/plc?platform=logo` | 200 | — | /prerendered/simulations/plc.html |
| `/simulations/arduino-studio` | 200 | https://maeacademy.org/simulations/arduino-studio | /prerendered/simulations/arduino-studio.html |
| `/simulations/code/python` | 200 | https://maeacademy.org/simulations/code/python | /prerendered/simulations/code/python.html |
| `/simulations/code/cpp` | 200 | https://maeacademy.org/simulations/code/cpp | /prerendered/simulations/code/cpp.html |
| `/simulations/code/c` | 200 | https://maeacademy.org/simulations/code/c | /prerendered/simulations/code/c.html |
| `/simulations/code/masm8086` | 200 | https://maeacademy.org/simulations/code/masm8086 | /prerendered/simulations/code/masm8086.html |
| `/simulations/digital-logic-design?tool=schematic` | 200 | — | /prerendered/simulations/digital-logic-design.html |
| `/simulations/signals-and-systems/signal-operations-and-properties` | 200 | https://maeacademy.org/simulations/signals-and-systems/signal-operations-and-properties | /prerendered/simulations/signals-and-systems/signal-operations-and-properties.html |
| `/simulations/signals-and-systems/system-classification` | 200 | https://maeacademy.org/simulations/signals-and-systems/system-classification | /prerendered/simulations/signals-and-systems/system-classification.html |
| `/simulations/signals-and-systems/convolution-engine` | 200 | https://maeacademy.org/simulations/signals-and-systems/convolution-engine | /prerendered/simulations/signals-and-systems/convolution-engine.html |
| `/simulations/signals-and-systems/fourier-analysis` | 200 | https://maeacademy.org/simulations/signals-and-systems/fourier-analysis | /prerendered/simulations/signals-and-systems/fourier-analysis.html |
| `/simulations/signals-and-systems/laplace-s-plane` | 200 | https://maeacademy.org/simulations/signals-and-systems/laplace-s-plane | /prerendered/simulations/signals-and-systems/laplace-s-plane.html |
| `/simulations/control-systems/root-locus` | 200 | https://maeacademy.org/simulations/control-systems/root-locus | /prerendered/simulations/control-systems/root-locus.html |
| `/simulations/control-systems/frequency-response` | 200 | https://maeacademy.org/simulations/control-systems/frequency-response | /prerendered/simulations/control-systems/frequency-response.html |
| `/simulations/control-systems/pid` | 200 | https://maeacademy.org/simulations/control-systems/pid | /prerendered/simulations/control-systems/pid.html |
| `/simulations/control-systems/state-space` | 200 | https://maeacademy.org/simulations/control-systems/state-space | /prerendered/simulations/control-systems/state-space.html |
| `/simulations/power-electronics/rectifier` | 200 | https://maeacademy.org/simulations/power-electronics/rectifier | /prerendered/simulations/power-electronics/rectifier.html |
| `/simulations/power-electronics/inverter` | 200 | https://maeacademy.org/simulations/power-electronics/inverter | /prerendered/simulations/power-electronics/inverter.html |
| `/simulations/power-electronics/acvc` | 200 | https://maeacademy.org/simulations/power-electronics/acvc | /prerendered/simulations/power-electronics/acvc.html |
| `/simulations/power-electronics/chopper` | 200 | https://maeacademy.org/simulations/power-electronics/chopper | /prerendered/simulations/power-electronics/chopper.html |
| `/simulations/circuit-lab` | 200 | https://maeacademy.org/simulations/circuit-lab | /prerendered/simulations/circuit-lab.html |
| `/simulations/pneumatics-and-hydraulics` | 200 | https://maeacademy.org/simulations/pneumatics-and-hydraulics | /prerendered/simulations/pneumatics-and-hydraulics.html |
| `/research` | 200 | https://maeacademy.org/research | /prerendered/research.html |
| `/library` | 200 | https://maeacademy.org/library | /prerendered/library.html |
| `/about` | 200 | https://maeacademy.org/about | /prerendered/about.html |
| `/contact` | 200 | https://maeacademy.org/contact | /prerendered/contact.html |
| `/privacy` | 200 | https://maeacademy.org/privacy | /prerendered/privacy.html |
| `/terms` | 200 | https://maeacademy.org/terms | /prerendered/terms.html |
| `/attribution-policy` | 200 | https://maeacademy.org/attribution-policy | /prerendered/attribution-policy.html |

## Express (dist/index.js, NODE_ENV=production, dummy NVIDIA_API_KEY) vs local Vercel emulator — sha256 of body
| URL | Express | Vercel emulator | |
|---|---|---|---|
| `/` | 200 793a262f1492 | 793a262f1492 | match |
| `/simulations/control-systems/pid` | 200 beece5561c8b | beece5561c8b | match |
| `/about` | 200 a5835665fba1 | a5835665fba1 | match |
| `/privacy-policy` | 200 4576ae090fdf | 4576ae090fdf | match |
| `/library/ia:x` | 200 a01ee4bf6d8b | a01ee4bf6d8b | match |
| `/research/W1` | 200 a01ee4bf6d8b | a01ee4bf6d8b | match |

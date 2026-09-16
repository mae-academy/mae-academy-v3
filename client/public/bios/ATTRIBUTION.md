# Vendored BIOS binaries

`seabios.bin` and `vgabios.bin` are fetched unmodified from the
[`copy/v86`](https://github.com/copy/v86) project (`bios/` directory,
`master` branch), BSD-2-Clause licensed:

> Copyright (c) 2012, The v86 contributors. All rights reserved.

These boot the stock `v86` npm package (`node_modules/v86`) so the emulator
can reach a running CPU state — the npm package itself ships no BIOS ROMs
(see its `package.json` `files` list). SeaBIOS is itself upstream LGPLv3;
Bochs VGA BIOS is LGPLv2.1+. Retained here under the v86 project's
redistribution terms; do not modify these files in place — refetch from
upstream instead.

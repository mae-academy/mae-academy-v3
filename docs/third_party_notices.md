# Third-Party Notices

## v86

The MAE 8086 Assembler Studio’s headless execution bridge incorporates a narrowly patched build of [v86](https://github.com/copy/v86), originally by copy and contributors, distributed under the **BSD 2-Clause License**. The bridge uses v86’s browser WebAssembly CPU engine without its visual interface. It adds a single-instruction debug export and a minimal INT 10h/INT 21h event callback required by the custom React laboratory surface.

Source and license: <https://github.com/copy/v86/blob/master/LICENSE>.

> Copyright (c) 2013-2026 copy and contributors. Redistribution and use in source and binary forms, with or without modification, are permitted provided that the copyright notice, conditions, and disclaimer are retained.

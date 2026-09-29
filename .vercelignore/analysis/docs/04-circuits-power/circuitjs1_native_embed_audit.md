# CircuitJS1 Native Iframe Embed Audit

## Upstream distribution findings

The upstream `sharpie7/circuitjs1` repository describes CircuitJS1 as a browser circuit simulator built with GWT. Its README identifies `war/` as the deployment output and states that the full-page application is served by `circuitjs.html`, with generated GWT assets, `circuits/`, and `setuplist.txt` beside it. It also explicitly recommends embedding the full-page application through an iframe rather than reconstructing the application inside a host page.

## URL bridge retained by the native application

The original full-page entry point accepts `cct`, `ctz`, `startCircuit`, `startCircuitLink`, `running`, `editable`, and related query parameters. The React wrapper must only forward the allowed startup parameters into the iframe URL; it must not inspect, restyle, or modify the GWT document.

## License boundary

The upstream repository exposes `COPYING.txt` headed **GNU General Public License, Version 2**. The native integration must keep the upstream copyright and license text with the distributed static bundle and preserve access to corresponding source as required by the license. The application integration will be a thin host wrapper only; no upstream Java/GWT/compiled source will be altered.

## Sources

1. [CircuitJS1 README](https://github.com/sharpie7/circuitjs1#readme)
2. [CircuitJS1 COPYING.txt](https://raw.githubusercontent.com/sharpie7/circuitjs1/master/COPYING.txt)

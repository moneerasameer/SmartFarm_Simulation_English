# Vendored browser libraries

These files are committed so the dashboard runs offline on a lab machine with no
npm access. They are **not** modified.

| File | Package | Version | License |
|---|---|---|---|
| `three.module.js` | [three](https://www.npmjs.com/package/three) | 0.160.1 | MIT |
| `addons/controls/OrbitControls.js` | three examples (`jsm/controls`) | 0.160.1 | MIT |
| `chart.umd.js` | [chart.js](https://www.npmjs.com/package/chart.js) | 4.4.1 | MIT |
| `mqtt.min.js` | [mqtt.js](https://www.npmjs.com/package/mqtt) (browser bundle) | 5.10.1 | MIT |

Downloaded from jsDelivr:

```
https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js
https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js
https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js
https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js
```

`index.html` maps the bare specifier `three` to `./vendor/three.module.js`
through an import map, so `OrbitControls.js` can keep its upstream import.

To update a library, replace the file and bump the version in this table; run
`tests/verify_web3d.py` afterwards to confirm that all imports still resolve.

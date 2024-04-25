Unsourcemap - Deobfuscate JavaScript code with source maps
=====================================================================

## Installation
`npm install -g unsourcemap`

TODO: publish

## Usage
```
usage: unsourcemap.js [-h] url

Deobfuscate JavaScript code with source maps

Positional arguments:
  url                   URL or FILE of javascript to Unsourcemap

Optional arguments:
  -h, --help            Show this help message and exit.
  -b BEAUTIFY_OPTS, --beautify-opts BEAUTIFY_OPTS
                        JS Beautifier options in JSON format
```

Unsourcemap will deobfuscate and beautify minified code using
[source maps](http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/).
[source maps library](https://github.com/mozilla/source-map).
Source
maps map compiled code back to the original code, including mangled to original
function and variable names. [JS Beautifier](http://jsbeautifier.org/) is used
under the hood for beautifying.

TODO: optional JS Beautifier.

This program will fail if source maps are not provided and available. Use JS
Beautifier directly for beautifying code without transforming variable and
function names.

As an example, see the
[Minified script](https://gist.github.com/txase/6043155#file-min-script)
and the generated
[Unsourcemapd script](https://gist.github.com/txase/6043177#file-full-script)
from http://dev.fontdragr.com.


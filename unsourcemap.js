#!/usr/bin/env node

var fs = require('fs');
var ArgumentParser = require('argparse').ArgumentParser;
var sourceMap = require('source-map');

var parser = new ArgumentParser({
    add_help: true,
    description: 'Deobfuscate JavaScript code using a source map',
});

parser.add_argument('src-js', {
    help: 'Path to javascript file to recover',
    nargs: 1
});
parser.add_argument('src-map', {
    help: 'Path to source-map to recover from',
    nargs: 1
});
parser.add_argument('out-dir', {
    help: 'Path to directory where sources will be dumped',
    nargs: 1
});
var args = parser.parse_args();

var minifiedCode = fs.readFileSync(args['src-js'][0], 'utf8');
var mapData = fs.readFileSync(args['src-map'][0], 'utf8');

var outDir = args['out-dir'][0];
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, 0o755);
}

function sanitizeSourceName(url) {
    return url.replace(/[^a-zA-Z0-9\-_.:]/g, '_');
}

var map = new sourceMap.SourceMapConsumer(mapData);

map.then((sourceMap) => {
    console.log(sourceMap.sources);
    for (var i = 0; i < sourceMap.sources.length; i++) {
        var sUrl = sourceMap.sources[i];
        console.log("Writing", sUrl);
        var dest = outDir + '/' + i + '-' + sanitizeSourceName(sUrl);
        var contents = sourceMap.sourceContentFor(sUrl);
        if (!!contents) {
            fs.writeFileSync(dest, contents, 'utf8', 0o644);
        } else {
            const lines = minifiedCode.split('\n');
            const reconstructedSource = {};

            lines.forEach((line, lineIndex) => {
                const lineNum = lineIndex + 1;
                const segments = line.split(';');

                segments.forEach((segment, segmentIndex) => {
                    const column = segment.length;
                    const pos = {
                        line: lineNum,
                        column: column
                    };
                    const originalPosition = sourceMap.originalPositionFor(pos);
                    console.log(pos, originalPosition);

                    if (originalPosition.source === null || originalPosition.name === null) {
                        return;
                    }

                    if (!reconstructedSource[originalPosition.source]) {
                        reconstructedSource[originalPosition.source] = [];
                    }

                    // Replace the obfuscated name with the original name
                    segments[segmentIndex] = segment.replace(/[_$][\w\d]+/g, originalPosition.name);
                });

                lines[lineIndex] = segments.join(';');

            });

            for (const source in reconstructedSource) {
                let prettyCode = lines.join('\n');
                const formattedCode = prettyCode; //prettier.format(prettyCode, { parser: 'babel' });
                // Log the reconstructed source code
                console.log(`Source: ${source}`);
                //console.log('Content:', formattedCode);
                fs.writeFileSync(dest, formattedCode, 'utf8', 0o644);
            }

        }
    }

});

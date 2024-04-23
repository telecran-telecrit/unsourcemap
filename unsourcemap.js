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
            let reconstructedSource = '';
            let lastSource = null;
            let before = 0;
            
            lines.forEach((line, lineIndex) => {
                const lineNum = lineIndex + 1;
                const columnCount = line.length;

                for (let column = 0; column < columnCount; column++) {
                    const pos = { line: lineNum, column: before+column };
                    const originalPosition = sourceMap.originalPositionFor(pos);
                    lastSource = originalPosition.source || lastSource;
                    if (originalPosition.source === null) {
                        reconstructedSource += minifiedCode.charAt(before+column);
                        continue;
                    }
                    lastSource = originalPosition.source;
                    if (originalPosition.name) {
                        ///reconstructedSource += minifiedCode.charAt(before+column);
                        reconstructedSource += ' ' + originalPosition.name;
                        let column2 = column;
                        do {
                            pos2 = { line: lineNum, column: ++column2 + before };
                            if (column2 >= columnCount) {
                                break;
                            }
                            originalPosition2 = sourceMap.originalPositionFor(pos2);
                        } while (originalPosition2.name == originalPosition.name && originalPosition2.line == originalPosition.line && originalPosition2.column == originalPosition.column);
                        column = column2 - 1;
                        
                        
                    } else {
                        reconstructedSource += minifiedCode.charAt(before+column);
                    }
                }
                before += columnCount;
                if (!!lastSource) {
                    reconstructedSource += '\n';
                }
            });

            //for (const source in reconstructedSource) {
                let prettyCode = reconstructedSource;
                const formattedCode = prettyCode; //prettier.format(prettyCode, { parser: 'babel' });
                // Log the reconstructed source code
                console.log(`Source: ${lastSource}`);
                //console.log('Content:', formattedCode);
                fs.writeFileSync(dest, formattedCode, 'utf8', 0o644);
            //}

        }
    }

});

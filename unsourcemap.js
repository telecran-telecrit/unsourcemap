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

function isAlphaNum (str) {
  var code, i, len;

  for (i = 0, len = str.length; i < len; i++) {
    code = str.charCodeAt(i);
    if (!(code > 47 && code < 58) && // numeric (0-9)
        !(code > 64 && code < 91) && // upper alpha (A-Z)
        !(code > 96 && code < 123) && // lower alpha (a-z)
        !(str[i] == '_')) { // underline
      return false;
    }
  }
  return true;
};

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
            let supercodes = [];
            console.log('lines min: ', lines.length);
            let reconstructedSource = '';
            let lastSource = null;
            let before = 0;
            let lastLine = 1;
            
            lines.forEach((line, lineIndex) => {
                const lineNum = lineIndex + 1;
                const columnCount = line.length;
                before = 0;                
                console.log(lineNum);
                

                for (let column = 0; column < columnCount; column++) {
                    const pos = { line: lineNum, column: before+column };
                    const originalPosition = sourceMap.originalPositionFor(pos);
                    lastSource = originalPosition.source || lastSource;
                    if (originalPosition.source === null || !isAlphaNum(line.charAt(before+column)) || !originalPosition.name) {
                        reconstructedSource += line.charAt(before+column);
                        continue;
                    }
                    lastSource = originalPosition.source;
                    if (originalPosition.name) {
                        if (!isAlphaNum(line.charAt(before+column))) {
                            reconstructedSource += '' + line.charAt(before+column);
                        }
                        while (originalPosition.line > lastLine) {
                            reconstructedSource += '\n';
                            ++lastLine;
                        }
                        supercode = originalPosition.name + '__' + originalPosition.line + '__' + originalPosition.column;
                        supermode = false;
                        if (supercodes.includes(supercode)) {
                            supermode = true;
                        } else {
                            supercodes.push(supercode);
                        }
                        if (!supermode) {
                            //reconstructedSource += '' + supercode + '__';
                            reconstructedSource += '' + originalPosition.name;
                        }
                        
                        if (isAlphaNum(line.charAt(before+column))) {
                            if (supermode) {
                                reconstructedSource += '' + line.charAt(before+column);
                            }
                        }
                        let column2 = column;
                        do {
                            pos2 = { line: lineNum, column: ++column2 + before };
                            if (column2 >= columnCount) {
                                break;
                            }
                            originalPosition2 = sourceMap.originalPositionFor(pos2);
                            if (!isAlphaNum(line.charAt(before+column2))) {
                                break;
                            }
                            if (supermode) {
                                reconstructedSource += '' + line.charAt(before+column2);
                            }
                        } while (originalPosition2.name == originalPosition.name && originalPosition2.line == originalPosition.line && originalPosition2.column == originalPosition.column);
                        column = column2 - 1;
                        
                        reconstructedSource += ' ';
                    } else {
                        reconstructedSource += line.charAt(before+column);
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

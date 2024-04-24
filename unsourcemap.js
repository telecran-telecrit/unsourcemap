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
        !(code >= 256) && // normal unicode
        !(str[i] == '_') && // underline
        !(str[i] == '$')) { // dollar
      return false;
    }
  }
  return true;
};

function isLikeSpace (h) {
    return h === ' ' || h === '\t' || h === '\r' || h === '\n' || h === '\b' || h === '\v'  || h === '\f' || h.charCodeAt(0) <= 32 || h.charCodeAt(0) == 127;
}

function isPunctuation (h, excludePunctuations = []) {
    return ['=', '.', ',', ':', ';', '{', '}', '[', ']', '(', ')', '<' , '>', '?', '!', '+', '-', '*', '/', '\\', '|', '%', '#', '@', '~', '^', '&', "'", '"', '`', '\u2019'].includes(h) && !excludePunctuations.includes(h);
}

function isReserved (beginStr) {
    //console.log('!isReserved: ', beginStr);
    return ['abstract',	'arguments',	'await', 'async',	'boolean', 'break',	'byte',	'case',	'catch', 'char',	'class',	'const',	'continue', 'debugger', 'default',	'delete',	'do', 'double',	'else',	'enum',	'eval', 'export',	'extends',	'false',	'final', 'finally',	'float',	'for',	'function', 'goto',	'if',	'implements',	'import', 'in', 'of',	'instanceof',	'int',	'interface', 'let',	'long',	'native',	'new', 'null', 'undefined',	'package',	'private',	'protected', 'public',	'return',	'short',	'static', 'super',	'switch',	'synchronized',	'this', 'throw',	'throws',	'transient',	'true', 'try',	'typeof',	'var',	'void', 'volatile',	'while',	'with',	'yield',].includes(beginStr);
}

function endsWithPunctuation (beginStr, excludePunctuations = []) {
    let pos = beginStr.length - 1;
    while (pos >= 0) {
        h = beginStr[pos];
        if (!isLikeSpace(h)) {
            break;
        }
        --pos;
    }
    if (pos >= 0) {
        h = beginStr[pos];
        return isPunctuation(h, excludePunctuations);
    } else {
        return false;
    }
} 

function endsWithReserved (beginStr, excludePunctuations = []) {
    let pos = beginStr.length - 1;
    while (pos >= 0) {
        h = beginStr[pos];
        if (!isLikeSpace(h)) {
            break;
        }
        --pos;
    }
    if (pos >= 0) {
        const posEnd = pos;
        --pos;
        
        while (pos >= 0) {
            h = beginStr[pos];
            if (isLikeSpace(h) || isPunctuation(h, excludePunctuations)) {
                break;
            }
            --pos;
        }
        if (pos < 0) {
            pos = 0;
            if (pos >= posEnd) {
                pos = -1;
            }
        }
        
        if (pos >= 0) {
            return isReserved(beginStr.substring(pos + 1, posEnd + 1));
        } else {
            return false;
        }
        
        //h = beginStr[pos];
        //return isPunctuation(h);
    } else {
        return false;
    }
} 

const _TABULATION = ' ';

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
            let wasBeginShifting = false;
            let wasBeginShiftingOnLine = -1; 
            let fixedBeginShifting = 0;
            let quoteMode = ' ';
            let quotePrev = undefined;
            let horizontalDeep = 0;
            
            lines.forEach((line, lineIndex) => {
                const lineNum = lineIndex + 1;
                const columnCount = line.length;
                before = 0;                
                //console.log(lineNum);
                

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
                        wasBeginShifting = false;
                        console.log('lastLine', lastLine);
                        while (originalPosition.line > lastLine) { // condition also avoids supercodes on same line
                            reconstructedSource = reconstructedSource.replace(/(".*?")|('.*?')|(`.*?`)|(\/.*?\/)|(\(.*?\))|  ;/g, (...m) => m[1] || m[2] || m[3] || m[4] || m[5] || ' ;');
                            reconstructedSource = reconstructedSource.replace(/(".*?")|('.*?')|(`.*?`)|(\/.*?\/)|(\(.*?\))| ;/g, (...m) => m[1] || m[2] || m[3] || m[4] || m[5] || ';');
                            reconstructedSource = reconstructedSource.replace(/(".*?")|('.*?')|(`.*?`)|(\/.*?\/)|(\(.*?\))|;/g, (...m) => m[1] || m[2] || m[3] || m[4] || m[5] || ' ;');
                            //reconstructedSource = reconstructedSource.replace(/(".*?")|('.*?')|(`.*?`)|(\/.*?\/)|(\(.*?\))|\}/g, (...m) => m[1] || m[2] || m[3] || m[4] || m[5] || ';}');
                            let reconstructedSourceOrig = reconstructedSource;
                            let quoteModeWas = quoteMode !== ' ';
                            let quoteSemicolonWas = false; 
                            
                            let isSemicolon = reconstructedSourceOrig.trim().split('').pop() == ';';
                            let beginStr = reconstructedSource.split('\n').slice(-1)[0];
                            
                            if (quoteMode === ' ' || quoteMode === 'h' || quoteMode === '*' || quoteMode === 'r') {
                                horizontalDeep = 0;
                                quoteMode = ' ';
                                quotePrev = undefined;
                            }
                            if (quoteMode === ' ') {
                                let pos = 0;
                                while (pos < beginStr.length) {
                                    if (beginStr[pos] == '"' || beginStr[pos] == "'" || beginStr[pos] == '`') {
                                        if ((quoteMode === ' ' || quoteMode === 'h')) { // open quote (simple)
                                            quoteMode = beginStr[pos];
                                        } else if (quoteMode !== '/' && quoteMode !== '*' && quoteMode === beginStr[pos] && quotePrev !== '\\') { // close qoute
                                            if (horizontalDeep == 0) {
                                                quoteMode = ' ';
                                            } else {
                                                quoteMode = 'h';
                                            }
                                            quotePrev = '\\';
                                        }
                                    } else if (beginStr[pos] === '/' && quotePrev === '/' && (quoteMode === ' ' || quoteMode === 'h')) { // open single comment
                                        quoteMode = '/';
                                    } else if (beginStr[pos] === '*' && quotePrev === '/' && (quoteMode === ' ' || quoteMode === 'h')) { // open multi comment
                                        quoteMode = '*';
                                    } else if (beginStr[pos] === '/' && quotePrev === '*' && quoteMode === '*') { // close multi comment
                                        if (horizontalDeep == 0) {
                                            quoteMode = ' ';
                                        } else {
                                            quoteMode = 'h';
                                        }
                                        quotePrev = '\\';
                                    } else if (beginStr[pos] === '\n' && quoteMode === '/') { // close single comment
                                        if (horizontalDeep == 0) {
                                            quoteMode = ' ';
                                        } else {
                                            quoteMode = 'h';
                                        }
                                        quotePrev = '\\';
                                    } else if (beginStr[pos] === '\n' && quoteMode !== '*' && quoteMode !== '`' && quoteMode !== ' ' && quoteMode !== 'h') {
                                        beginStr[pos] = ' '; // fix possible error 1
                                    } else if (beginStr[pos] === ')' && quotePrev !== undefined && quotePrev !== '\\' && quoteMode === 'h') { // close round bracket
                                        --horizontalDeep;
                                        if (horizontalDeep <= 0) {
                                            quoteMode = ' ';
                                            horizontalDeep = 0;
                                        }
                                    } else if (beginStr[pos] === '(' && quotePrev !== undefined && quotePrev !== '\\' && (quoteMode === ' ' || quoteMode === 'h')) { // open round bracket
                                        quoteMode = 'h';
                                        ++horizontalDeep;
                                    } else if (beginStr[pos] === '/' && quotePrev !== undefined && quotePrev !== '\\' && quoteMode === 'r') { // close regex
                                        if (horizontalDeep == 0) {
                                            quoteMode = ' ';
                                        } else {
                                            quoteMode = 'h';
                                        }
                                        //console.log(quotePrev, beginStr[pos]);
                                        quotePrev = '\\';
                                    } else if (beginStr[pos] === '/' &&  quotePrev != '/' && quotePrev != '*' && quotePrev != '\\' && (quoteMode === ' ' || quoteMode === 'h') && endsWithPunctuation(beginStr.substring(0, pos), ['}', ']', ')', '>', '<'])) { // open regex
                                        quoteMode = 'r';
                                        //console.log(quotePrev, beginStr[pos]); 
                                    }
                                    if (beginStr[pos] == ';' && quoteMode !== ' ') { // semicolon within any quotation mode is danger
                                        quoteSemicolonWas = true;
                                    }
                                    quoteModeWas = quoteModeWas || (quoteMode !== ' ' && quoteMode !== 'h');
                                    if (quotePrev === '\\') {
                                        quotePrev = '_'
                                    } else {
                                        quotePrev = beginStr[pos];
                                    }
                                    pos++;
                                    //console.log(quotePrev);
                                }
                            } else {
                                quoteSemicolonWas = true;
                            }
                            
                            if (!quoteSemicolonWas) {
                                reconstructedSource = reconstructedSourceOrig;
                                /////reconstructedSource = reconstructedSource.replace(/;/g, '\n'); // TODO: exclude quoted semicolon
                                reconstructedSource = reconstructedSource.replace(/;\n\n\n/g, '  ;\n');
                                reconstructedSource = reconstructedSource.replace(/;\n\n/g, ' ;\n');
                                reconstructedSource = reconstructedSource.replace(/ ;/g, ';\n'); // TODO: exclude quoted semicolon
                                beginStr = reconstructedSource.split('\n').slice(-1)[0];
                                if (isSemicolon) {
                                    //beginStr = beginStr.trim() + ';';
                                }
                            }
                            
                            let diffCount = reconstructedSource.split('\n').length - reconstructedSourceOrig.split('\n').length;
                            //console.log('beginStr0', beginStr);
                            //console.log('quoteMode', quoteMode, horizontalDeep, quoteModeWas, quoteSemicolonWas);
                            
                            if (quoteMode === 'r') {
                                //console.log('beginStr0', beginStr);
                            }
                            
                            if (quoteMode !== ' ' && quoteMode !== 'h') {
                                beginStr = '';
                                wasBeginShifting = true;
                            } else {
                                
                                //console.log('beginStr0', beginStr);
                                //console.log('beginStr.length', beginStr.length);
                                //console.log('reconstructedSource.length - beginStr.length', reconstructedSource.length - beginStr.length)
                                //console.log('fixedBeginShifting', fixedBeginShifting);
                                //console.log('fixedBeginShifting <=', fixedBeginShifting <= reconstructedSource.length - beginStr.length)
                                beginSpecial = false;
                                if (!wasBeginShifting && fixedBeginShifting <= reconstructedSource.length - beginStr.length && (endsWithPunctuation(beginStr, ['{', '}']) || endsWithReserved(beginStr) || (beginSpecial = endsWithPunctuation(beginStr)))) {
                                    reconstructedSource = reconstructedSource.split('\n').slice(0, -1).join('\n');
                                    wasBeginShifting = true;
                                    wasBeginShiftingOnLine = originalPosition.line;
                                    //if (isSemicolon && diffCount > 0) {
                                    //    beginStr = beginStr.trim() + ';';
                                    //    --diffCount;
                                    //}
                                } else {
                                    reconstructedSource = reconstructedSourceOrig;
                                    beginStr = ''
                                }
                                let k1 = reconstructedSource.split('\n').length;
                                if (diffCount > 0) {
                                    if (beginStr.trim().length > 0) {
                                        if (reconstructedSourceOrig.length > reconstructedSource.length && (reconstructedSourceOrig[reconstructedSource.length] == '\n' || reconstructedSourceOrig[reconstructedSource.length] == ';')) {
                                            reconstructedSource = reconstructedSourceOrig.substring(0, reconstructedSource.length + 1);
                                        } else {
                                            reconstructedSource = reconstructedSourceOrig.substring(0, reconstructedSource.length);
                                        }
                                        reconstructedSource = reconstructedSourceOrig.substring(0, reconstructedSource.length + 1);
                                        if (reconstructedSource[reconstructedSource.length - 1] != '\n' && reconstructedSource[reconstructedSource.length - 1] != ';') {
                                            reconstructedSource = reconstructedSourceOrig.substring(0, reconstructedSource.length - 1);
                                        }
                                    } else {
                                        reconstructedSource = reconstructedSourceOrig;
                                    }
                                }
                                let k2 = reconstructedSource.split('\n').length;
                                diffCount -= Math.abs(k1 - k2);
                                beginStr = beginStr.trim();
                                //console.log('beginStr ', beginStr);
                                if (diffCount >= 1 && beginStr == '') {
                                    //reconstructedSource += ';';
                                    //--diffCount;
                                }
                                //console.log('diffCount', diffCount);
                                
                                reconstructedSource += '\n'.repeat((originalPosition.line - lastLine - 1 >= 0) ? originalPosition.line - lastLine - 1 : 0);
                                const leftTabs = (beginStr.length > originalPosition.column) ? originalPosition.column : originalPosition.column - beginStr.length;
                                if (beginSpecial) {
                                    reconstructedSource += ((_TABULATION.repeat(leftTabs - 1 >= 0 ? leftTabs - 1 : 0))) + beginStr;
                                }
                                reconstructedSource += '\n' + ((_TABULATION.repeat(leftTabs))); /// + originalPosition.column + '000' + originalPosition.line + ' ');
                                //console.log('reconstructedSource ', reconstructedSource, '\n\n\n');
                                if (!beginSpecial) {
                                    reconstructedSource += beginStr;
                                }
                            }
                            //reconstructedSource = reconstructedSource.replace(/(".*?")|('.*?')|(`.*?`)|(\/.*?\/)|(\(.*?\))|;\W*\n\W*;/g, (...m) => m[1] || m[2] || m[3] || m[4] || m[5] || ';\n');
                            //reconstructedSource = reconstructedSource.replace(/(".*?")|('.*?')|(`.*?`)|(\/.*?\/)|(\(.*?\))|;\W*;/g, (...m) => m[1] || m[2] || m[3] || m[4] || m[5] || ';');
                            
                            fixedBeginShifting = reconstructedSource.length;
                            
                            ++lastLine;
                            lastLine = originalPosition.line;
                        }
                        if (!wasBeginShifting) {
                            horizontalDeep = 0;
                            quoteMode = ' ';
                            quotePrev = '_';
                        }
                        supercode = originalPosition.name + '__' + originalPosition.line + '__' + originalPosition.column;
                        supermode = false;
                        if (supercodes.includes(supercode)) {
                            supermode = true;
                        } else {
                            supercodes.push(supercode);
                        }
                        if (!supermode) {
                            if (endsWithReserved(reconstructedSource)) {
                                reconstructedSource += ' ';
                            }
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
                        if (endsWithReserved(reconstructedSource)) {
                            reconstructedSource += ' ';
                        }
                    } else {
                        reconstructedSource += line.charAt(before+column);
                    }
                }
                before += columnCount;
                //if (!!lastSource) {
                //    reconstructedSource += '\n';
                //}
            });

            let prettyCode = '';
            let wasReserved = false;
            for (let source of reconstructedSource.split('\n')) {
                if (wasReserved) {
                    wasReserved = source.trim().length == 0 || !endsWithPunctuation(source) || endsWithReserved(source);
                    prettyCode += ' ';
                } else {
                    prettyCode += '\n';
                    wasReserved = endsWithReserved(source);
                }
                prettyCode += source;
            }
                const formattedCode = prettyCode; //prettier.format(prettyCode, { parser: 'babel' });
                // Log the reconstructed source code
                console.log(`Source: ${lastSource}`);
                //console.log('Content:', formattedCode);
                fs.writeFileSync(dest, formattedCode, 'utf8', 0o644);
            //}

        }
    }

});

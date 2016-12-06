const css = require('css');
const R = require('ramda');
const fs = require('fs');
const path = require('path');

let fileIn,
    fileOut;

let readFile = () => {
    return new Promise(function(fulfill, reject) {
        fs.readFile(fileIn, function(err, data) {
            if (err) {
                reject(err);
            } else {
                fulfill(data);
            }
        });
    });
}

let writeFile = (data) => {
    return new Promise(function(fulfill, reject) {
        fs.writeFile(fileOut, JSON.stringify(data), function(err) {
            if (err) {
                reject(err);
            } else {
                fulfill(data);
            }
        });
    });
};

let logic = (data) => {
    try {
        let parsedData = parse(data),
            isValid = validate(parsedData);
        if (isValid) {
            processAST(parsedData);
        }
    } catch (err) {
        console.warn('error: issue with parsing');
        return false;
    }
};

let parse = (data) => {
    return new Promise(function(fulfill, reject) {
        try {
            let parsedData = css.parse(data.toString(), { silent: false });
            fulfill(parsedData);
        } catch (err) {
            reject(err);
        }
    });
};

let validate = (data) => {
    return new Promise(function(fulfill, reject) {
        let isStylesheet = data.type === 'stylesheet',
            hasNoParsingErrors = 'stylesheet' in data && data.stylesheet.parsingErrors.length === 0,
            hasKeyframes = R.any((rule) => rule.type === 'keyframes', data.stylesheet.rules);
        if (!isStylesheet || !hasNoParsingErrors || !hasKeyframes) {
            if (!isStylesheet) {
                throw 'error: ast is not of type stylesheet';
            }
            if (!hasNoParsingErrors) {
                R.map(err => console.warn(new Error(`error: ${err}`)), data.stylesheet.parsingErrors);
                throw 'error: file has parse error';
            }
            if (!hasKeyframes) {
                throw 'error: no keyframes rules found';
            }
            reject('validation error');
        }
        fulfill(data);
    });
};

let processAST = (data) => {
    return new Promise(function(fulfill, reject) {
        try {
            // original version with no ramda visible at http://codepen.io/gibbok/pen/PbRrxp
            let processKeyframe = (vals, declarations) => [
                R.map(R.cond([
                    [R.equals('from'), R.always(0)],
                    [R.equals('to'), R.always(100)],
                    [R.T, parseFloat]
                ]), vals),
                R.reduce(R.merge, {},
                    R.map(R.converge(R.objOf, [
                        R.prop('property'),
                        R.prop('value')
                    ]), declarations))
            ];

            let processAnimation = (offsets, transf) =>
                R.map(R.pipe(
                    R.objOf('offset'),
                    R.merge(transf)), offsets);

            let getContentOfKeyframes = R.map(R.pipe(
                R.converge(processKeyframe, [
                    R.prop('values'),
                    R.prop('declarations')
                ]),
                R.converge(processAnimation, [
                    R.nth(0),
                    R.nth(1)
                ])));

            let transformAST = R.pipe(
                R.path(['stylesheet', 'rules']),
                R.filter(R.propEq('type', 'keyframes')),
                R.map((keyframe) => ({
                    name: keyframe.name,
                    content: getContentOfKeyframes(keyframe.keyframes)
                })),
                R.converge(R.zipObj, [
                    R.map(R.prop('name')),
                    R.map(R.pipe(R.prop('content'), R.flatten))
                ]));
            let result = transformAST(data)
            fulfill(result);
        } catch (err) {
            reject(err);
        }

    });
};

let getNodeArguments = () => {
    return new Promise(function(fulfill, reject) {
        try {
            let hasFileInOutArgs = process.argv.length === 4,
                isCssExt = false,
                isJsonExt = false,
                argFileIn = '',
                argFileOut = '';
            if (!hasFileInOutArgs) {
                throw ('arguments for file-in and file-out must be provided');
            }
            argFileIn = path.resolve(path.normalize(__dirname + process.argv[2])).toString();
            argFileOut = path.resolve(path.normalize(__dirname + process.argv[3])).toString();
            if (!argFileIn.endsWith('.css')) {
                throw ('argument file-in must have extension .css');
            }
            if (!argFileOut.endsWith('.json')) {
                throw ('argument file-out must have extension .json');
            }
            // var [,, argFileIn, argFileOut] = process.argv; // destructuring assignment
            fileIn = argFileIn;
            fileOut = argFileOut;
            fulfill();
        } catch (err) {
            reject(err);
        }
    });
};

let init = () => {
    try {
        getNodeArguments().then(() => {
            return readFile();
        }).then((data) => {
            return parse(data);
        }).then((data) => {
            return validate(data);
        }).then((data) => {
            return processAST(data);
        }).then((data) => {
            return writeFile(data);
        }).then((data) => {
            console.log('success: file created at: ' + fileOut);
        });
    } catch (err) {
        console.warn(`error: ${err}`);
    }
};

init();
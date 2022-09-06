'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const crypto = require('crypto');

Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr) => crypto.randomBytes(arr.length),
  },
});

require('./wasm_exec');

const uniqueLines = lines => {
  return Array.from(new Set(lines.trim().split("\n"))).join("\n")
}

const jsonLinesToJson = jsonLines => {
  return "[" + jsonLines.trim().split("\n").join(",") + "]"
}

const terminate = code => {
  if (go.exited) {
    return;
  }

  opa.finish();
  if (code === 0 && !go.exited) {
    go._pendingEvent = { id: 0 };
    go._resume();
  }
}

const go = new Go();
process.on('exit', terminate);

module.exports = {
  inspect: (filename, rego, annotations_only=false) => {
    return new Promise((resolve, reject) => {
      WebAssembly.instantiate(
        fs.readFileSync(path.resolve(__dirname, 'inspect.wasm')),
        go.importObject
      )
      .then(result => {
        go.run(result.instance);
      })
      .then(() => {
        const val = opa.inspect(filename, rego);
        if (val.startsWith("ERR:")) {
          reject(val);
        } else {
          const ruleData = JSON.parse(jsonLinesToJson(uniqueLines(val)))
          // Optionally remove records for rules with no annotations
          resolve(annotations_only ? ruleData.filter(a => a.annotations) : ruleData);
        }
      })
      .catch(reject)
      .finally(terminate);
    });
  },

  inspectFile: (filename, annotations_only=false) => {
    return module.exports.inspect(filename, fs.readFileSync(filename).toString(), annotations_only)
  },

  inspectFiles: (globPattern, annotations_only=false) => {
    const inspectAll = glob.sync(globPattern).map(f => module.exports.inspectFile(f, annotations_only))
    return Promise.all(inspectAll).then(a => a.flat())
  },

 }

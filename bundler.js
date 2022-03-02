const path = require("path");
const fs = require("fs");
const acorn = require('acorn');
const traverse = require('@babel/traverse').default;
const babel = require("@babel/core");

let ID = 0;

function createAsset(filename) {
    const filePath = path.resolve(__dirname, filename);
    const content = fs.readFileSync(filePath);

    const ast = acorn.parse(content, {
        sourceType: "module"
    });

    const dependencies = [];

    traverse(ast, {
        ImportDeclaration: ({node}) => {
            dependencies.push(node.source.value);
        }
    });

    const id = ID++;
    const {code} = babel.transformSync(content, {
        presets: ["@babel/preset-env"]
    });

    return {id, filename, dependencies, code};

}

function createGraph(entry) {
    const mainAsset = createAsset(entry);

    const queue = [mainAsset];

    for (const asset of queue) {

        asset.mapping = {};

        asset.dependencies.forEach(dependency => {
            const child = createAsset(dependency);
            asset.mapping[dependency] = child.id;

            queue.push(child);
        });
    }

    return queue;
}

function bundle(graph) {
    let modules = "";

    graph.forEach(module => {
        modules += `${module.id}: [
            function(require, module, exports) {${module.code}},
            ${JSON.stringify(module.mapping)}
        ],`;
    })

    return `
        (function(modules){
            function require(id) {
                const [fn, mapping] = modules[id];
                
                function localRequire(path) {
                    return require(mapping[path])
                }
                
                const module = {exports: {}};
                fn(localRequire, module, module.exports);
                
                return module.exports;
            }
            
            require(0);
        })({${modules}})
    `;
}

const graph = createGraph("./entry.js");
const result = bundle(graph);
console.log(graph);

fs.writeFileSync("./bundle.js", result);


const fs = require('fs');
const path = require('path');

const digitalDir = path.join(__dirname, 'client/src/simulators/digital-logic');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk(digitalDir);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;

    // We replace @/simulators/circuit-engine/... with @/simulators/digital-logic/...
    const newContent = content.replace(/@\/simulators\/circuit-engine/g, '@/simulators/digital-logic');
    
    // BUT wait, is there a global shared ui `ErrorBoundary` etc?
    // The previous script already fixed V3Math and ErrorBoundary to @/components/ui
    // So the remaining @/simulators/circuit-engine are pure domain leakage!
    
    if (newContent !== content) {
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`Fixed leakage in ${file}`);
    }
});

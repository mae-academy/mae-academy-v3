const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'client/src');

// Map of filenames to their new directory paths relative to @/
const fileMap = {
    // Circuit Engine
    'analogSimulation': 'simulators/circuit-engine/engine',
    'analogDocumentedMna': 'simulators/circuit-engine/engine',
    'analogNewtonMna': 'simulators/circuit-engine/engine',
    'NodalSolver': 'simulators/circuit-engine/engine',
    'MeshSolver': 'simulators/circuit-engine/engine',
    'SuperpositionSolver': 'simulators/circuit-engine/engine',
    'TheveninSolver': 'simulators/circuit-engine/engine',
    'SourceTransformationSolver': 'simulators/circuit-engine/engine',
    'mnaSolver': 'simulators/circuit-engine/engine',
    'reducedNodalMatrix': 'simulators/circuit-engine/engine',
    
    'circuitTypes': 'simulators/circuit-engine/models',
    'analysisTypes': 'simulators/circuit-engine/models',
    'componentDefs': 'simulators/circuit-engine/models',
    'analogComponentCatalog': 'simulators/circuit-engine/models',
    'AcademicNodalDictionary': 'simulators/circuit-engine/models',
    'NormalizedCircuitGraph': 'simulators/circuit-engine/models',
    'nadFormat': 'simulators/circuit-engine/models',
    'analysisFormatting': 'simulators/circuit-engine/models',
    'analogResultAdapter': 'simulators/circuit-engine/models',
    'componentInteraction': 'simulators/circuit-engine/models',
    'componentHealthCheck': 'simulators/circuit-engine/models',
    'wiring': 'simulators/circuit-engine/models',
    'utils': 'simulators/circuit-engine/models',
    
    'analogCanvasGeometry': 'simulators/circuit-engine/components',
    'meshGeometry': 'simulators/circuit-engine/components',
    'symbols': 'simulators/circuit-engine/components',
    'AnalogCircuitSimulator': 'simulators/circuit-engine/components',
    
    // UI components from v3-simulator that moved
    'V3Math': 'simulators/circuit-engine/components/ui-components',
    'AnalysisBox': 'simulators/circuit-engine/components/ui-components',
    'ErrorBoundary': 'simulators/circuit-engine/components/ui-components',
    'useSimulation': 'simulators/circuit-engine/components/hooks',
    
    // Digital Logic Engine
    'kmapSolver': 'simulators/digital-logic/engine',
    'digitalLogicSimulation': 'simulators/digital-logic/engine',
    'desLogicCore': 'simulators/digital-logic/engine',
    'idealLogicEngine': 'simulators/digital-logic/engine',
    'simulation': 'simulators/digital-logic/engine', // wait, analog also has simulation!
    'digitalLogicDocumentedMna': 'simulators/digital-logic/engine',
    'digitalLogicNewtonMna': 'simulators/digital-logic/engine',
    
    // Digital Logic Models
    'digitalLogicCatalog': 'simulators/digital-logic/models',
    'logicGateContract': 'simulators/digital-logic/models',
    'logicInputBindings': 'simulators/digital-logic/models',
    'digitalLogicResultAdapter': 'simulators/digital-logic/models',
    'const': 'simulators/digital-logic/models',
    
    // Digital Components
    'DigitalCircuitSimulator': 'simulators/digital-logic/components',
    'digitalLogicCanvasGeometry': 'simulators/digital-logic/components',
    'dynamicLogicGeometry': 'simulators/digital-logic/components',
    'kmapGeometry': 'simulators/digital-logic/components',
    'WaveformTrack': 'simulators/digital-logic/components/ui-components',
    'DMM': 'simulators/digital-logic/components/ui-components',
    'Oscilloscope': 'simulators/digital-logic/components/ui-components',
    'Map': 'simulators/digital-logic/components/ui-components',
    'ManusDialog': 'simulators/digital-logic/components/ui-components',
    
    // Logic Pages
    'LogicAnalyzer': 'simulators/digital-logic/components/pages',
    'TimingWaveforms': 'simulators/digital-logic/components/pages',
    'KMapMinimizer': 'simulators/digital-logic/components/pages',
    'UniversalSynthesis': 'simulators/digital-logic/components/pages',
    'StateMachineExplorer': 'simulators/digital-logic/components/pages',
};

// Also analog has `simulation`, digital has `simulation`
// Better to replace based on original path patterns
const replacePath = (importPath, currentFilePath) => {
    // Example import paths to catch:
    // '@/v3-simulator/lib/analogSimulation'
    // '../lib/analogSimulation'
    // '@/DigitalLogicDesign/lib/desLogicCore'
    // '../../DigitalLogicDesign/utils/logicEngine/ast'
    
    let isV3 = importPath.includes('v3-simulator') || (currentFilePath.includes('circuit-engine') && importPath.startsWith('.'));
    let isDigital = importPath.includes('DigitalLogicDesign') || (currentFilePath.includes('digital-logic') && importPath.startsWith('.'));
    
    let basename = importPath.split('/').pop();
    
    // Handle the special case where analog and digital both have identical file names
    if (basename === 'simulation' || basename === 'symbols' || basename === 'circuitTypes' || basename === 'analysisTypes' 
        || basename === 'componentDefs' || basename === 'AcademicNodalDictionary' || basename === 'NormalizedCircuitGraph' 
        || basename === 'nadFormat' || basename === 'analysisFormatting' || basename === 'wiring' || basename === 'utils' || basename === 'mnaSolver'
        || basename === 'MeshSolver' || basename === 'SuperpositionSolver' || basename === 'SourceTransformationSolver' || basename === 'TheveninSolver'
        || basename === 'NodalSolver' || basename === 'reducedNodalMatrix' || basename === 'meshGeometry') {
        
        let domain = isDigital ? 'simulators/digital-logic' : 'simulators/circuit-engine';
        let subfolder = 'models';
        if (['simulation', 'mnaSolver', 'MeshSolver', 'SuperpositionSolver', 'SourceTransformationSolver', 'TheveninSolver', 'NodalSolver', 'reducedNodalMatrix'].includes(basename)) subfolder = 'engine';
        if (['symbols', 'meshGeometry'].includes(basename)) subfolder = 'components';
        return `@/${domain}/${subfolder}/${basename}`;
    }
    
    // Folder specific mappings
    if (importPath.includes('utils/logicEngine')) {
        return importPath.replace(/.*utils\/logicEngine/, '@/simulators/digital-logic/engine/logicEngine');
    }
    
    if (importPath.includes('components/circuit/AnalogCircuitSimulator')) {
        return '@/simulators/circuit-engine/components/AnalogCircuitSimulator';
    }
    if (importPath.includes('components/circuit/DigitalCircuitSimulator')) {
        return '@/simulators/digital-logic/components/DigitalCircuitSimulator';
    }
    
    if (fileMap[basename]) {
        return `@/${fileMap[basename]}/${basename}`;
    }
    
    // For anything else from v3-simulator or DigitalLogicDesign
    if (importPath.includes('v3-simulator')) {
        // Fallback for v3
        if (importPath.includes('/hooks/')) return `@/simulators/circuit-engine/components/hooks/${basename}`;
        if (importPath.includes('/components/')) return `@/simulators/circuit-engine/components/ui-components/${basename}`;
        if (importPath.includes('/pages/')) return `@/simulators/circuit-engine/components/pages/${basename}`;
    }
    if (importPath.includes('DigitalLogicDesign')) {
        // Fallback for digital
        if (importPath.includes('/hooks/')) return `@/simulators/digital-logic/components/hooks/${basename}`;
        if (importPath.includes('/components/')) return `@/simulators/digital-logic/components/ui-components/${basename}`;
        if (importPath.includes('/pages/')) return `@/simulators/digital-logic/components/pages/${basename}`;
        if (importPath.includes('/contexts/')) return `@/simulators/digital-logic/components/contexts/${basename}`;
        if (importPath.includes('/utils/')) return `@/simulators/digital-logic/engine/${basename}`;
    }
    
    return importPath;
};

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

const files = walk(srcDir);
const importRegex = /(from\s+['"])([^'"]+)(['"])|(import\s*\(\s*['"])([^'"]+)(['"]\s*\))/g;

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let modified = false;
    
    content = content.replace(importRegex, (match, p1, p2, p3, p4, p5, p6) => {
        let prefix = p1 || p4;
        let importPath = p2 || p5;
        let suffix = p3 || p6;
        
        // Only modify if it involves our target paths or relative paths inside them
        let shouldProcess = importPath.includes('v3-simulator') || 
                            importPath.includes('DigitalLogicDesign') || 
                            importPath.includes('components/circuit') ||
                            (file.includes('simulators/') && importPath.startsWith('.'));
                            
        if (shouldProcess) {
            let newPath = replacePath(importPath, file);
            if (newPath !== importPath) {
                modified = true;
                return prefix + newPath + suffix;
            }
        }
        return match;
    });
    
    if (modified) {
        fs.writeFileSync(file, content, 'utf8');
        console.log(`Updated imports in ${file}`);
    }
});

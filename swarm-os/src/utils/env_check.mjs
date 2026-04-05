import fs from 'node:fs';
import path from 'node:path';

export function runEnvironmentValidation() {
    const nodeMajor = process.version.match(/^v(\d+)/)[1];
    if (parseInt(nodeMajor) < 20) {
        console.error(`\x1b[31m[FAIL] Required Node.js v20+. Found ${process.version}\x1b[0m`);
        process.exit(1);
    }
    
    if (!process.env.FEATHERLESS_API_KEY) {
        console.error(`\x1b[31m[FAIL] Missing process.env.FEATHERLESS_API_KEY\x1b[0m`);
        console.error(`Please set your active Featherless token in the local env to utilize the Cognitive execution limits.`);
        process.exit(1);
    }

    const foxPath = path.join(process.cwd(), 'foxmq-bin', 'foxmq.exe');
    if (!fs.existsSync(foxPath)) {
        console.error(`\x1b[31m[FAIL] Unable to locate native FoxMQ Broker at ${foxPath}\x1b[0m`);
        process.exit(1);
    }

    console.log(`\x1b[32m[PASS] OmniSwarm Environment Validated.\x1b[0m`);
}

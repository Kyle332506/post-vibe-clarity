import { writeFileSync } from 'node:fs';

writeFileSync('literal-arguments.json', `${JSON.stringify(process.argv.slice(2))}\n`);

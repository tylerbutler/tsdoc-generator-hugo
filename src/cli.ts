#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const argv = yargs(hideBin(process.argv)).argv;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
// const { ...rest } = yargs
//     // const argv = yargs //(process.argv.slice(2))
//     .version(true) // Disable default version flag (we're using our own in the next line)
//     .commandDir("./commands")
//     .demandCommand()
//     .scriptName("tsdocgen")
//     .help()
//     .alias("h", "help").argv;

// console.log(JSON.stringify(commands));
// console.log(JSON.stringify(rest));

#!/usr/bin/env node

import { ApiModel } from "@microsoft/api-extractor-model";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { HugoDocumenter, HugoDocumenterOptions } from "./hugo.js";

const parser = yargs(hideBin(process.argv))
    .options({
        "input": {
            alias: "i",
            demandOption: true,
            default: "./api",
            describe: "Path to input folder",
            type: "string"
        },
        "output": {
            alias: "o",
            demandOption: true,
            default: "./api-md",
            describe: "Path to output folder",
            type: "string"
        },
    });

(async () => {
    const argv = await parser.argv;

    const documenter = new HugoDocumenter({
        apiModel: new ApiModel(),
        inputPath: argv.input,
        outputPath: argv.output,
    });

    documenter.generateFiles();

})();

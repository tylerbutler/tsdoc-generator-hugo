#!/usr/bin/env node

import { ApiModel } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { DocumenterConfig } from "./DocumenterConfig.js";
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
        "config": {
            alias: "c",
            demandOption: true,
            default: `./${DocumenterConfig.FILENAME}`,
            describe: "Path to output folder",
            type: "string"
        }
    });

(async () => {
    const argv = await parser.argv;

    FileSystem.exists(argv.config);
    const docConfig = DocumenterConfig.loadFile(argv.config);

    console.log(`output path: ${argv.output}`);

    const documenter = new HugoDocumenter({
        apiModel: new ApiModel(),
        inputPath: argv.input,
        outputPath: argv.output,
        documenterConfig: docConfig,
    });

    documenter.generateFiles();

})();

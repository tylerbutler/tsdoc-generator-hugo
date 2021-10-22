// import * as ae from "@microsoft/api-extractor-model";
// const { ApiItem, ApiItemKind, ApiModel, ApiPackage, ApiParameterListMixin } = ae;

import {
    ApiClass,
    ApiDeclaredItem,
    ApiDocumentedItem,
    ApiEnum,
    ApiFunction,
    ApiInterface,
    ApiItem,
    ApiItemKind,
    ApiModel,
    ApiNamespace,
    ApiPackage,
    ApiParameterListMixin,
    ApiReleaseTagMixin,
    ApiTypeAlias,
    ApiVariable,
    Excerpt,
    ExcerptTokenKind,
    IResolveDeclarationReferenceResult,
    ReleaseTag
} from "@microsoft/api-extractor-model";
import { gfm } from "micromark-extension-gfm";
import { compact } from "mdast-util-compact";
import {
    DocBlock,
    DocBlockTag,
    DocCodeSpan,
    DocComment,
    DocErrorText,
    DocEscapedText,
    DocFencedCode,
    DocHtmlEndTag,
    DocHtmlStartTag,
    DocLinkTag,
    DocNode,
    DocNodeKind,
    DocNodeTransforms,
    DocParagraph,
    DocPlainText,
    DocSection,
    StandardTags,
    StringBuilder
} from "@microsoft/tsdoc";
import { ConsoleTerminalProvider, FileSystem, FileSystem as fs, PackageName } from "@rushstack/node-core-library";
import chalk from "chalk";
import type { Break, Code, Content, Heading, HTML, InlineCode, Link, Paragraph, PhrasingContent, Root, Strong, Table, TableRow, Text } from "mdast";
import * as md from "mdast-builder";
import { fromMarkdown } from "mdast-util-from-markdown";
import { frontmatterToMarkdown, frontmatterFromMarkdown } from "mdast-util-frontmatter";
import { gfmToMarkdown, gfmFromMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { toString } from "mdast-util-to-string";
import path from "path";
import remarkGfm from "remark-gfm";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { DocumenterConfig } from "./DocumenterConfig.js";
import { callout } from "./mdNodes.js";
import { getSafeFilenameForName, groupBy, groupByApiKind, isAllowedPackage } from "./util.js";
import { squeezeParagraphs } from "mdast-squeeze-paragraphs";
import { getDeprecatedCallout, getNotes, getRemarks, getSignature, getSummary } from "./sections.js";
import { GeneratePackageMdast } from "./generators.js";
import { MdOutputPage } from "./types.js";



// export type InlineKinds = ApiItemKind.Variable | ApiItemKind.
export const PageKind = (item: ApiItem) => {
    const isPage = [ApiItemKind.Class, ApiItemKind.Interface].includes(item.kind);
    return isPage ? "Page" : "Inline";
}
export class FrontMatter {
    public title: string = "";
    public kind: ApiItemKind = ApiItemKind.None;
    public package: string = "";
    public summary?: string;
    public members = new Map<string, Map<string, string>>();
    public unscopedPackageName?: string;

    public toString(): string {
        const str: StringBuilder = new StringBuilder();
        str.append(`title: "${this.title}"\n`);
        str.append(`kind: "${this.kind}"\n`);
        str.append(`package: "${this.package}"\n`);
        if (this.summary) {
            str.append(`summary: "${this.summary}"\n`);
        }
        return str.toString();
    }
}

export interface HugoDocumenterOptions {
    apiModel?: ApiModel;
    inputPath: string;
    outputPath: string;
    documenterConfig: DocumenterConfig;
}

// const mdRoot = md.root([
//     md.heading(2, md.text("Begin")),
//     md.paragraph([
//         md.paragraph(md.text("these are the starting instructions")),
//         md.brk,
//         md.brk,
//         md.list("unordered", [
//             md.listItem(md.text("one")),
//             md.listItem(md.text("two")),
//             md.listItem(md.text("three"))
//         ])
//     ])
// ]) as Root;

// const tree: Root = {
//     type: "root",
//     children: [
//         {
//             type: "blockquote",
//             children: [
//                 { type: "thematicBreak" },
//                 {
//                     type: "paragraph",
//                     children: [
//                         { type: "text", value: "- a\nb !" },
//                         {
//                             type: "link",
//                             url: "example.com",
//                             children: [{ type: "text", value: "d" }]
//                         }
//                     ]
//                 }
//             ]
//         }
//     ]
// };

// const markdown: string = toMarkdown(tree);
// console.log(markdown);

const processor = unified()
    .use(remarkGfm)
    .use(remarkStringify, {
        bullet: "-",
        fence: "`",
        fences: true,
        incrementListMarker: false
    });

export class HugoDocumenter {
    private readonly _apiModel: ApiModel;
    private readonly _inputPath: string;
    private readonly _outputPath: string;
    private readonly _documenterConfig: DocumenterConfig;
    private _frontmatter: FrontMatter;
    private _currentApiItemPage?: ApiItem;

    public constructor(options: HugoDocumenterOptions) {
        this._apiModel = options.apiModel ? options.apiModel : new ApiModel();
        this._inputPath = options.inputPath;
        this._outputPath = options.outputPath;
        this._documenterConfig = options.documenterConfig;
        this._frontmatter = new FrontMatter();
    }

    private _loadApiFiles(inputPath: string, model?: ApiModel): ApiModel {
        const apiModel = model ? model : new ApiModel();

        fs.ensureFolder(inputPath);

        for (const filename of fs.readFolder(inputPath)) {
            if (/\.api\.json$/i.test(filename)) {
                console.log(`Reading ${filename}`);
                const filenamePath: string = path.join(inputPath, filename);
                apiModel.loadPackage(filenamePath);
            }
        }
        return apiModel;
    }

    public generateFiles(): void {
        console.log();
        fs.ensureEmptyFolder(this._outputPath);

        this._loadApiFiles(this._inputPath, this._apiModel);
        if (this._apiModel.kind !== ApiItemKind.Model) {
            throw new Error(`Expected a Model, got a: ${this._apiModel.kind}`);
        }
        for (const pkg of this._apiModel.members) {
            WriteApiFiles(pkg, 0, this._outputPath);
        }
    }
}

async function WriteApiFiles(model: ApiItem, level: number, outputPath: string): Promise<void> {
    let tree: Root = md.root() as Root;
    let others: MdOutputPage[] = [];
    const indent = level.toString().repeat(level);

    console.log(
        chalk.blueBright(`${indent}${model.kind} - ${model.displayName} - ${model.members.length} members`)
    );

    switch (model.kind) {
        case ApiItemKind.Package:
            console.log(`Writing package: ${model.displayName}`);
            [tree, others] = await GeneratePackageMdast(model as ApiPackage);
            break;
        case ApiItemKind.Model:
        default:
            throw new Error(`Cannot handle ApiItemKind.${model.kind}`);
    }

    const toMd = (r: Root): string => {
        return toMarkdown(squeezeParagraphs(compact(r)), {
            bullet: "-",
            listItemIndent: "one",
            incrementListMarker: false,
            extensions: [
                gfmToMarkdown(),
                frontmatterToMarkdown(["toml", "yaml"])
            ]
        });
    }
    const fromMd = fromMarkdown(toMd(tree), "utf8", {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown()],
    });
    // console.log(toMarkdown(fromMd, { extensions: [gfmToMarkdown(), frontmatterToMarkdown(["toml", "yaml"])] }));
    console.log(toMd(tree));
    FileSystem.writeFile(path.join(outputPath, PackageName.getUnscopedName(model.displayName) + ".md"), toMd(tree));

    for (const page of others) {
        console.log(toMd(page.mdast));
        const pkg = page.item.getAssociatedPackage();
        const unscopedName = pkg ? PackageName.getUnscopedName(pkg.displayName) : "_unknown";
        const targetPath = path.join(outputPath, unscopedName);
        FileSystem.ensureFolder(targetPath);
        FileSystem.writeFile(path.join(targetPath, page.item.displayName + ".md"), toMd(tree));

    }
    // console.log(JSON.stringify(fromMd, undefined, 2));

    // for (const member of entrypoint.members) {
    //     console.log(chalk.green(`${member.kind} -- ${member.displayName}`));
    // }

    // for (const member of model.members) {
    //     logMembers(member, level + 1);
    // }
}



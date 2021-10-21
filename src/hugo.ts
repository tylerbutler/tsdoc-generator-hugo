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
import { callout } from "./nodes.js";
import { getSafeFilenameForName, groupBy, groupByApiKind, isAllowedPackage } from "./util.js";
import { squeezeParagraphs } from "mdast-squeeze-paragraphs";



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
            logMembers(pkg, 0, this._outputPath);
        }
    }
}

function logMembers(model: ApiItem, level: number, outputPath: string) {
    const indent = level.toString().repeat(level);
    //((" " as any) * level) as unknown as string;
    console.log(
        chalk.blueBright(`${indent}${model.kind} - ${model.displayName} - ${model.members.length} members`)
    );

    switch (model.kind) {
        case ApiItemKind.Package:
            console.log(`Writing package: ${model.displayName}`);
            createPackageDocs(model, outputPath);
            break;
        case ApiItemKind.Model:
        default:
            throw new Error(`Cannot handle ApiItemKind.${model.kind}`);
    }

    // for (const member of model.members) {
    //     logMembers(member, level + 1);
    // }
}

function createPackageDocs(pkg: ApiItem, outputPath: string): void {
    if (pkg.kind !== ApiItemKind.Package) {
        throw new Error(`Expected a Package, got a: ${pkg.kind}`);
    }

    const tree = md.root() as Root;

    const entrypoint = pkg.members[0];
    console.log(chalk.blue(`Found package entrypoint -- ${entrypoint.members.length} members`));
    tree.children.push(getBreadcrumb(entrypoint));
    tree.children.push(md.heading(1, md.text(pkg.displayName)) as Heading);
    tree.children.push(getSummary(pkg));
    tree.children.push(getRemarks(pkg));

    // for (const member of entrypoint.members.filter(i => [ApiItemKind.Class, ApiItemKind.Interface].includes(i.kind))) {
    //     console.log(chalk.green(`${member.kind} -- ${member.displayName}`));
    // }

    // const groups = groupBy(entrypoint.members, (item: ApiItem) => PageKind(item));

    // const inline = groups.get("Inline");
    // const pages = groups.get("Page");

    // const variables = entrypoint.members
    //     .filter(item => item.kind === ApiItemKind.Variable)
    //     .map(item => item as ApiVariable);

    const classes = entrypoint.members.filter(i => i.kind === ApiItemKind.Class).map(i => i as ApiClass);
    const interfaces = entrypoint.members.filter(i => i.kind === ApiItemKind.Interface).map(i => i as ApiInterface);
    const typeAliases = entrypoint.members.filter(i => i.kind === ApiItemKind.TypeAlias).map(i => i as ApiTypeAlias);

    const groups = groupBy(entrypoint.members, item => item.kind);
    const variables = groups.get(ApiItemKind.Variable)?.map(i => i as ApiVariable);
    const functions = groups.get(ApiItemKind.Function)?.map(i => i as ApiFunction);
    const enums = groups.get(ApiItemKind.Enum)?.map(i => i as ApiEnum);

    if (variables) {
        tree.children.push(md.heading(2, [md.text("Variables")]) as Heading);
        tree.children.push(GenerateTable(variables));

        variables.forEach(variable => tree.children.push(GenerateSection(variable, 3)));

        // for (const variable of variables) {
        //     tree.children.push(getSectionForItem(variable, 2));
        // }
    }

    if (interfaces) {
        tree.children.push(md.heading(2, [md.text("Interfaces")]) as Heading);
        tree.children.push(GenerateTable(interfaces));
    }

    if (classes) {
        tree.children.push(md.heading(2, [md.text("Classes")]) as Heading);
        tree.children.push(GenerateTable(classes));
    }

    if (typeAliases) {
        tree.children.push(md.heading(2, [md.text("Type aliases")]) as Heading);
        tree.children.push(GenerateTable(typeAliases));

        typeAliases.forEach(alias => tree.children.push(GenerateSection(alias, 3)));
    }

    if (enums) {
        tree.children.push(md.paragraph([md.heading(2, [md.text("Enums")])]) as Paragraph);
        tree.children.push(GenerateTable(enums));
    }

    if (functions) {
        tree.children.push(md.heading(2, [md.text("Functions")]) as Heading);
        tree.children.push(GenerateTable(functions));
    }

    // console.log(tree);
    const toMd = toMarkdown(squeezeParagraphs(compact(tree)), {
        bullet: "-",
        listItemIndent: "one",
        incrementListMarker: false,
        extensions: [
            gfmToMarkdown(),
            frontmatterToMarkdown(["toml", "yaml"])
        ]
    });
    const fromMd = fromMarkdown(toMd, "utf8", {
        extensions: [gfm()],
        mdastExtensions: [gfmFromMarkdown(), frontmatterFromMarkdown()],
    });
    // console.log(toMarkdown(fromMd, { extensions: [gfmToMarkdown(), frontmatterToMarkdown(["toml", "yaml"])] }));
    console.log(toMd);
    FileSystem.writeFile(path.join(outputPath, PackageName.getUnscopedName(pkg.displayName) + ".md"), toMd);
    // console.log(JSON.stringify(fromMd, undefined, 2));

    // for (const member of entrypoint.members) {
    //     console.log(chalk.green(`${member.kind} -- ${member.displayName}`));
    // }
}

function getBreadcrumb(apiItem: ApiItem): Paragraph {
    const output = md.paragraph([
        md.link(_getLinkFilenameForApiItem(apiItem), "Home", [md.text("Home")]),
        md.text(" > "),
    ]) as Paragraph;

    for (const hierarchyItem of apiItem.getHierarchy()) {
        console.log(chalk.red(`hierarchyItem: ${hierarchyItem.kind} ${hierarchyItem}`));
        switch (hierarchyItem.kind) {
            case ApiItemKind.Model:
            case ApiItemKind.EntryPoint:
                // We don't show the model as part of the breadcrumb because it is the root-level container.
                // We don't show the entry point because today API Extractor doesn"t support multiple entry points;
                // this may change in the future.
                break;
            default:
                output.children.push(md.link(_getLinkFilenameForApiItem(hierarchyItem), hierarchyItem.displayName, [md.text(hierarchyItem.displayName)]) as Link);
        }
    }
    return output;
}

function getSummary(apiItem: ApiItem, withHeading = false): Paragraph {
    const nodes: Content[] = [];

    if (apiItem instanceof ApiDocumentedItem) {
        const tsdocComment = apiItem.tsdocComment;

        if (tsdocComment) {
            // if (tsdocComment.deprecatedBlock) {
            //     // console.log(chalk.red(`${apiItem.displayName} is deprecated!`))
            //     const block = tsdocComment.deprecatedBlock;
            //     nodes.push(callout("warning", "Deprecated", docNodesToMdast(block.getChildNodes())));
            // }

            if (tsdocComment.summarySection) {
                if (withHeading) {
                    nodes.push(md.heading(4, md.text("Summary")) as Heading);
                    nodes.push(md.text("\n\n") as Text);
                }
                nodes.push(...docNodesToMdast(tsdocComment.summarySection.nodes));
            }
        }
    }
    return md.paragraph(nodes) as Paragraph;
}

function getDeprecatedCallout(item: ApiDocumentedItem): Paragraph {
    if (item.tsdocComment?.deprecatedBlock) {
        // console.log(chalk.red(`${apiItem.displayName} is deprecated!`))
        const block = item.tsdocComment?.deprecatedBlock;
        return callout("warning", "Deprecated", docNodesToMdast(block.getChildNodes()));
    } else return md.paragraph() as Paragraph;
}


function getRemarks(apiItem: ApiItem): Paragraph {
    const nodes: Content[] = [];
    if (apiItem instanceof ApiDocumentedItem) {
        const tsdocComment = apiItem.tsdocComment;

        if (tsdocComment) {
            // Write the @remarks block
            if (tsdocComment.remarksBlock) {
                nodes.push(md.heading(3, md.text("Remarks")) as Heading)
                nodes.push(...docNodesToMdast(tsdocComment.remarksBlock.content.nodes));
            }

            // Write the @example blocks
            const exampleBlocks: DocBlock[] = tsdocComment.customBlocks.filter(
                (x) => x.blockTag.tagNameWithUpperCase === StandardTags.example.tagNameWithUpperCase
            );

            let exampleNumber: number = 1;
            for (const exampleBlock of exampleBlocks) {
                const heading: string = exampleBlocks.length > 1 ? `Example ${exampleNumber}` : 'Example';

                nodes.push(md.heading(4, md.text(heading)) as Heading);
                nodes.push(...docNodesToMdast(exampleBlock.content.nodes));

                ++exampleNumber;
            }
        }
    }
    return md.paragraph(nodes) as Paragraph;
}

function getNotes(apiItem: ApiItem): Paragraph {
    const nodes: Content[] = [];
    if (apiItem instanceof ApiDocumentedItem) {
        const tsdocComment = apiItem.tsdocComment;

        if (tsdocComment) {
            // Write the @remarks block
            if (tsdocComment.deprecatedBlock) {
                nodes.push(md.strong(md.text("Deprecated:")) as Strong);
                nodes.push(md.text(" ") as Text);
                nodes.push(...docNodesToMdast(tsdocComment.deprecatedBlock.getChildNodes()));
            }
        }
    }
    return md.paragraph(nodes) as Paragraph;
}

function getSignature(item: ApiDeclaredItem): Paragraph {
    const nodes: Content[] = [];

    nodes.push(md.strong(md.text("Signature:")) as Strong);
    nodes.push(md.text("\n\n") as Text);

    nodes.push(md.code("typescript", item.getExcerptWithModifiers()) as Code);
    return md.paragraph(nodes) as Paragraph;
}

function _getFilenameForApiItem(apiItem: ApiItem): string {
    if (apiItem.kind === ApiItemKind.Model) {
        return 'index.md';
    }

    let baseName = '';
    for (const hierarchyItem of apiItem.getHierarchy()) {
        // For overloaded methods, add a suffix such as "MyClass.myMethod_2".
        let qualifiedName: string = getSafeFilenameForName(hierarchyItem.displayName);
        if (ApiParameterListMixin.isBaseClassOf(hierarchyItem)) {
            // eslint-disable-next-line unicorn/no-lonely-if
            if (hierarchyItem.overloadIndex > 1) {
                // Subtract one for compatibility with earlier releases of API Documenter.
                // (This will get revamped when we fix GitHub issue #1308)
                qualifiedName += `_${hierarchyItem.overloadIndex - 1}`;
            }
        }

        switch (hierarchyItem.kind) {
            case ApiItemKind.EntryPoint:
                break;
            case ApiItemKind.Package:
                baseName = getSafeFilenameForName(PackageName.getUnscopedName(hierarchyItem.displayName));
                break;
            default:
                baseName += '.' + qualifiedName;
        }
    }
    return baseName + '.md';
}

function _getLinkFilenameForApiItem(apiItem: ApiItem): string {
    return './' + _getFilenameForApiItem(apiItem);
}

export function plainTextToMdast(docNode: DocPlainText): Content[] {
    // const content:Content[] = [];
    const docPlainText = docNode as DocPlainText;
    // console.log(chalk.bgBlue(docPlainText.text));
    const toReturn = fromMarkdown(docPlainText.text);
    return toReturn.children;
}

export function docNodesToMdast(nodes: readonly DocNode[]): Content[] {
    const res = nodes
        // .filter(n=>docNodeToMdast(n) !== undefined)
        .flatMap((n) => {
            const mdast = docNodeToMdast(n);
            if (mdast !== undefined) {
                return mdast;
            }
            else return [] as Content[];
        });
    return res;
}

export function docNodeToMdast(docNode: DocNode): Content[] | undefined {
    // console.log(chalk.greenBright(docNode.kind));
    // console.log(chalk.greenBright(docNode));

    switch (docNode.kind) {
        case DocNodeKind.Block:
        case DocNodeKind.BlockTag:
            const tagNode: DocBlockTag = docNode as DocBlockTag;
            console.warn(chalk.yellow(`Unsupported block tag: ${tagNode.tagName}`));
            break;
        case DocNodeKind.CodeSpan:
            const code = docNode as DocCodeSpan;
            return [md.inlineCode(code.code) as InlineCode];
        case DocNodeKind.Comment:
            const comment = docNode as DocComment;
            break;
        case DocNodeKind.ErrorText:
            const docErrorText = docNode as DocErrorText;
            return [md.text(docErrorText.text) as Text];
        case DocNodeKind.EscapedText:
            const docEscapedText = docNode as DocEscapedText;
            return [md.text(docEscapedText.decodedText) as Text];
        case DocNodeKind.FencedCode:
            const docFencedCode = docNode as DocFencedCode;
            return [md.code(docFencedCode.language, docFencedCode.code) as Code];
        case DocNodeKind.HtmlStartTag:
        case DocNodeKind.HtmlEndTag:
            const docHtmlTag = docNode as DocHtmlStartTag | DocHtmlEndTag;
            return [md.html(docHtmlTag.emitAsHtml()) as HTML];
        case DocNodeKind.InlineTag:
            break;
        case DocNodeKind.LinkTag:
            const docLinkTag = docNode as DocLinkTag;
            if (docLinkTag.codeDestination) {
                throw new Error("writeLinkTagWithCodeDestination()");
            } else if (docLinkTag.urlDestination) {
                const linkText: string =
                    docLinkTag.linkText !== undefined ? docLinkTag.linkText : docLinkTag.urlDestination;
                return [md.link(docLinkTag.urlDestination, undefined, md.text(linkText)) as Link];
            } else if (docLinkTag.linkText) {
                return [md.text(docLinkTag.linkText) as Text];
            }
        case DocNodeKind.Paragraph:
            const docParagraph = docNode as DocParagraph;
            const trimmedParagraph = DocNodeTransforms.trimSpacesInParagraph(docParagraph);
            const children: Content[] = docNodesToMdast(trimmedParagraph.nodes);
            return [md.paragraph(children) as Paragraph];
        case DocNodeKind.PlainText:
            // return [md.text((docNode as DocPlainText).text) as Text];
            return plainTextToMdast(docNode as DocPlainText);
        case DocNodeKind.Section:
            const docSection: DocSection = docNode as DocSection;
            const sectionChildren: Content[] = docNodesToMdast(docSection.nodes);
            return [md.paragraph(sectionChildren) as Paragraph];
        case DocNodeKind.SoftBreak:
            return [md.brk as Break];
        default:
            throw new Error(`Unsupported DocNodeKind kind: ${docNode.kind}`);
    }
}


function GenerateSection(item: ApiVariable | ApiTypeAlias, headingLevel = 2): Paragraph {
    const nodes: Content[] = [md.heading(headingLevel, md.text(item.name)) as Heading];
    nodes.push(md.text("\n\n") as Text);

    if (item.tsdocComment) {
        const depItem = getDeprecatedCallout(item as ApiDocumentedItem);
        nodes.push(depItem);
        nodes.push(getSummary(item));
        nodes.push(getRemarks(item));
    }

    nodes.push(getSignature(item as ApiDeclaredItem));

    return md.paragraph(nodes) as Paragraph;
}

function GenerateTable(items: (ApiFunction | ApiEnum | ApiVariable | ApiClass | ApiInterface | ApiTypeAlias)[]): Paragraph {
    const table = md.table([null], []) as Table;

    let kind: ApiItemKind = ApiItemKind.Enum;
    let typeExcerpt = (item: ApiItem) => "";

    if (items.length > 0) {
        kind = items[0].kind;
        if (items[0] instanceof ApiFunction) {
            typeExcerpt = (item: ApiItem) => (item as ApiFunction).returnTypeExcerpt.text;
        } else if (items[0] instanceof ApiVariable) {
            typeExcerpt = (item: ApiItem) => (item as ApiVariable).variableTypeExcerpt.text;
        } else {
            // default
        }
    }

    // Headers are in the first row of table
    table.children.push(md.tableRow([
        md.tableCell([md.text(kind.toString())]),
        md.tableCell([md.text("Type")]),
        md.tableCell([md.text("Description")]),
        md.tableCell([md.text("Notes")])
    ]) as TableRow);

    for (const item of items) {
        const summary = getSummary(item);
        const remarks = getRemarks(item);
        const notes = getNotes(item);
        table.children.push(md.tableRow([
            md.tableCell([md.text(item.name)]),
            md.tableCell([md.text(typeExcerpt(item))]),
            md.tableCell([summary]),
            md.tableCell([notes])
        ]) as TableRow);
    }

    const classDecoration = md.text(`\n{.table .${kind.toLowerCase()}-table}\n`)

    return md.paragraph([table, classDecoration]) as Paragraph;
}

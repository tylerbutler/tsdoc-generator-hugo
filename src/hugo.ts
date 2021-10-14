// import * as ae from "@microsoft/api-extractor-model";
// const { ApiItem, ApiItemKind, ApiModel, ApiPackage, ApiParameterListMixin } = ae;

import { ApiItemKind, ApiReleaseTagMixin, ReleaseTag } from "@microsoft/api-extractor-model";
import { ApiItem, ApiModel, ApiPackage, ApiParameterListMixin } from "@microsoft/api-extractor-model";
import path from "path";
import { fromMarkdown } from "mdast-util-from-markdown";
// import { MarkdownDocumenterAccessor } from "../plugin/MarkdownDocumenterAccessor";
// import { MarkdownDocumenterFeatureContext } from "../plugin/MarkdownDocumenterFeature";
// import { MarkdownDocumenter } from "@microsoft/api-documenter";
import type { Node, Parent } from "unist";
import type { Heading, Code, Link, Root, Content, } from "mdast";
import * as md from "mdast-builder";
import { toMarkdown } from "mdast-util-to-markdown";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { DocSection, StringBuilder, TSDocConfiguration } from "@microsoft/tsdoc";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { gfmToMarkdown } from "mdast-util-gfm";

import { FileSystem as fs, PackageName } from "@rushstack/node-core-library";
import { getSafeFilenameForName } from "./util.js";
import chalk from "chalk";
import { Paragraph } from "mdast-util-from-markdown/lib";

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
}

const mdRoot = md.root([
    md.heading(2, md.text("Begin")),
    md.paragraph([
        md.paragraph(md.text("these are the starting instructions")),
        md.brk,
        md.brk,
        md.list("unordered", [
            md.listItem(md.text("one")),
            md.listItem(md.text("two")),
            md.listItem(md.text("three"))
        ])
    ])
]) as Root;

const tree: Root = {
    type: "root",
    children: [
        {
            type: "blockquote",
            children: [
                { type: "thematicBreak" },
                {
                    type: "paragraph",
                    children: [
                        { type: "text", value: "- a\nb !" },
                        {
                            type: "link",
                            url: "example.com",
                            children: [{ type: "text", value: "d" }]
                        }
                    ]
                }
            ]
        }
    ]
};

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
    private _frontmatter?: FrontMatter;
    private _currentApiItemPage?: ApiItem;

    public constructor(options: HugoDocumenterOptions) {
        this._apiModel = options.apiModel ? options.apiModel : new ApiModel();
        this._inputPath = options.inputPath;
        this._outputPath = options.outputPath;
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

        this._writeApiItemPage(this._apiModel);
    }

    protected _writeApiItemPage(apiItem: ApiItem): void {
        // const configuration: TSDocConfiguration = this._tsdocConfiguration;
        // const output: DocSection = new DocSection({ configuration: this._tsdocConfiguration });
        // const output = builder.root();

        if (this._shouldHaveStandalonePage(apiItem)) {
            this._frontmatter = new FrontMatter();
            this._currentApiItemPage = apiItem;
        }

        const breadcrumb = this.getBreadcrumb(apiItem);
        const heading = this.getHeading(apiItem);
        const betaWarning = this.getBetaWarning(apiItem);


        // if (apiItem instanceof ApiDocumentedItem) {
        //     const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

        //     if (tsdocComment) {
        //         if (tsdocComment.deprecatedBlock) {
        //             if (this._documenterConfig && this._documenterConfig.logLevel === 'verbose') {
        //                 for (const node of tsdocComment.deprecatedBlock.content.nodes) {
        //                     console.log(`NODE: ${node.kind}, CHILDREN: [${node.getChildNodes().map(v => v.kind)}]`);
        //                 }
        //             }
        //             output.appendNode(
        //                 new DocNoteBox(
        //                     {
        //                         configuration: this._tsdocConfiguration,
        //                         type: 'warning',
        //                         title: 'Deprecated'
        //                     }, [...tsdocComment.deprecatedBlock.content.nodes]
        //                 )
        //             );
        //         }

        //         this._appendSection(output, tsdocComment.summarySection);
        //     }
        // }


        const tree = md.root([
            breadcrumb,
        ]) as Root;

        if (heading) {
            tree.children.push(heading);
        }
        if (betaWarning) {
            tree.children.push(betaWarning);
        }

        // const log = processor.stringify();

        // console.log(toMarkdown(mdRoot));
        console.log(tree);
        console.log(toMarkdown(tree, { extensions: [gfmToMarkdown()] }));

    }

    protected getBreadcrumb(apiItem: ApiItem): Node {
        const output = md.paragraph([
            md.link(this._getLinkFilenameForApiItem(apiItem), "Home"),
            md.text(" > "),
        ]);

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
                    output.children.push(md.link(this._getLinkFilenameForApiItem(hierarchyItem), hierarchyItem.displayName));
            }
        }
        return output;
    }

    protected getHeading(apiItem: ApiItem): Heading | undefined {
        const scopedName: string = apiItem.getScopedNameWithinPackage();
        console.log(scopedName);
        let output: Heading;

        switch (apiItem.kind) {
            case ApiItemKind.Package:
                console.log(`Writing ${apiItem.displayName} package`);
                // const unscopedPackageName: string = PackageName.getUnscopedName(apiItem.displayName);
                // output.appendNode(new DocHeading({ configuration, title: `${unscopedPackageName} package` }));
                break;
            case ApiItemKind.Model:
                output = { type: "heading", depth: 1, children: [{ type: "text", value: "API Reference" }] }
                //fromMarkdown(`# API Reference`) as Heading;
                return output;
            case ApiItemKind.Class:
                //output.appendNode(new DocHeading({ configuration, title: `${scopedName} class` }));
                break;
            case ApiItemKind.Enum:
                output = { type: "heading", depth: 2, children: [{ type: "text", value: `${scopedName} enum {${scopedName}}` }] }
                return output;
            case ApiItemKind.Interface:
                //output.appendNode(new DocHeading({ configuration, title: `${scopedName} interface` }));
                break;
            case ApiItemKind.Constructor:
            case ApiItemKind.ConstructSignature:
                output = { type: "heading", depth: 3, children: [{ type: "text", value: `${scopedName} {${scopedName}}` }] }
                return output;
            case ApiItemKind.Namespace:
                output = { type: "heading", depth: 2, children: [{ type: "text", value: `${scopedName} namespace {${scopedName}}` }] }
                return output;
            case ApiItemKind.Method:
            case ApiItemKind.MethodSignature:
            case ApiItemKind.Function:
            case ApiItemKind.Property:
            case ApiItemKind.PropertySignature:
            case ApiItemKind.TypeAlias:
            case ApiItemKind.Variable:
                output = { type: "heading", depth: 3, children: [{ type: "text", value: `${apiItem.displayName} {${apiItem.displayName}}` }] }
                return output;
            default:
                throw new Error('Unsupported API item kind: ' + apiItem.kind);
        }
        return undefined;
    }

    protected getBetaWarning(apiItem: ApiItem): Content | undefined {
        if (ApiReleaseTagMixin.isBaseClassOf(apiItem)) {
            if (apiItem.releaseTag === ReleaseTag.Beta) {
                return md.paragraph([
                    md.text("Warning! This is a beta!")
                ]) as Paragraph;
            }
        }
        return undefined;
    }
    protected _getFilenameForApiItem(apiItem: ApiItem): string {
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
                case ApiItemKind.Model:
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

    protected _getLinkFilenameForApiItem(apiItem: ApiItem): string {
        return './' + this._getFilenameForApiItem(apiItem);
    }

    protected _shouldHaveStandalonePage(apiItem: ApiItem): boolean {
        return [
            // These kinds _should_ have standalone pages.
            ApiItemKind.Package,
            ApiItemKind.Class,
            ApiItemKind.Interface
        ].includes(apiItem.kind);
    }
}

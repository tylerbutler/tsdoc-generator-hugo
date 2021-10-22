import {
    ApiClass,
    ApiDeclaredItem,
    ApiDocumentedItem,
    ApiInterface,
    ApiItem,
    ApiItemKind,
    ApiModel,
    ApiNamespace,
    ApiPackage,
    ApiParameterListMixin,
    ApiReleaseTagMixin,
    Excerpt,
    ExcerptTokenKind,
    IResolveDeclarationReferenceResult,
    ReleaseTag
} from "@microsoft/api-extractor-model";
import {
    DocBlock, DocComment, StandardTags
} from "@microsoft/tsdoc";
import { FileSystem as fs, PackageName } from "@rushstack/node-core-library";
import chalk from "chalk";
import type { Code, Content, Heading, Link, PhrasingContent, Root, Text } from "mdast";
import * as md from "mdast-builder";
import { Paragraph } from "mdast-util-from-markdown/lib";
import { frontmatterToMarkdown } from "mdast-util-frontmatter";
import { gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import path from "path";
import { DocumenterConfig } from "./DocumenterConfig.js";
import { FrontMatter, HugoDocumenterOptions } from "./hugo.js";
import { callout, docNodesToMdast, docNodeToMdast } from "./mdNodes.js";
import { getSafeFilenameForName, isAllowedPackage } from "./util.js";

export class HugoDocumenterOld {
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

        const tree = md.root() as Root;

        const breadcrumb = this.getBreadcrumb(apiItem);
        tree.children.push(breadcrumb);

        const heading = this.getHeading(apiItem);
        if (heading) {
            tree.children.push(heading);
        }

        const betaWarning = this.getBetaWarning(apiItem);
        if (betaWarning) {
            tree.children.push(betaWarning);
        }

        let summarySection: Paragraph | undefined;
        if (apiItem instanceof ApiDocumentedItem) {
            summarySection = this.getSummarySection(apiItem);
        }
        if (summarySection) {
            tree.children.push(summarySection);
        }

        let codeExcerpt: Paragraph;
        if (apiItem instanceof ApiDeclaredItem) {
            codeExcerpt = md.paragraph(...this.getCodeExcerpt(apiItem as ApiDeclaredItem)) as Paragraph;
            tree.children.push(codeExcerpt);
        }

        let appendRemarks: boolean = true;
        let remarks: Paragraph;
        switch (apiItem.kind) {
            case ApiItemKind.Class:
            case ApiItemKind.Interface:
            case ApiItemKind.Namespace:
            case ApiItemKind.Package:
                remarks = this.getRemarks(apiItem);
                tree.children.push(remarks);
                appendRemarks = false;
                break;
        }

        switch (apiItem.kind) {
            case ApiItemKind.Class:
                // this._writeClassTables(output, apiItem as ApiClass);
                break;
            case ApiItemKind.Enum:
                // this._writeEnumTables(output, apiItem as ApiEnum);
                break;
            case ApiItemKind.Interface:
                // this._writeInterfaceTables(output, apiItem as ApiInterface);
                break;
            case ApiItemKind.Constructor:
            case ApiItemKind.ConstructSignature:
            case ApiItemKind.Method:
            case ApiItemKind.MethodSignature:
            case ApiItemKind.Function:
                // this._writeParameterTables(output, apiItem as ApiParameterListMixin);
                // this._writeThrowsSection(output, apiItem);
                break;
            case ApiItemKind.Namespace:
                // this._writePackageOrNamespaceTables(output, apiItem as ApiNamespace);
                break;
            case ApiItemKind.Model:
                // this._writeModelTable(output, apiItem as ApiModel);
                break;
            case ApiItemKind.Package:
                // this._writePackageOrNamespaceTables(output, apiItem as ApiPackage);
                break;
            case ApiItemKind.Property:
            case ApiItemKind.PropertySignature:
                break;
            case ApiItemKind.TypeAlias:
                break;
            case ApiItemKind.Variable:
                break;
            default:
                throw new Error('Unsupported API item kind: ' + apiItem.kind);
        }

        if (appendRemarks) {
            remarks = this.getRemarks(apiItem);
            tree.children.push(remarks);
        }

        // we only generate top level package pages (which will generate class and interface subpages)
        const pkg: ApiPackage | undefined = apiItem.getAssociatedPackage();
        if (!pkg || !isAllowedPackage(pkg, this._documenterConfig)) {
            if (this._documenterConfig && this._documenterConfig.logLevel === 'verbose') {
                console.log(`skipping ${apiItem.getScopedNameWithinPackage()}`);
                if (pkg) {
                    console.log(`\t${pkg.name} package isn't in the allowed list`);
                }
            }
            return;
        }

        // temp hack to reduce the size of the generated content
        if (!this._shouldHaveStandalonePage(apiItem)) {
            return;
        }

        // const log = processor.stringify();

        // console.log(toMarkdown(mdRoot));
        console.log(tree);
        console.log(toMarkdown(tree, { extensions: [gfmToMarkdown(), frontmatterToMarkdown(["toml", "yaml"])] }));

    }

    protected getBreadcrumb(apiItem: ApiItem): Paragraph {
        const output = md.paragraph([
            md.link(this._getLinkFilenameForApiItem(apiItem), "Home", [md.text("Home")]),
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
                    output.children.push(md.link(this._getLinkFilenameForApiItem(hierarchyItem), hierarchyItem.displayName, [md.text(hierarchyItem.displayName)]) as Link);
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

    protected getSummarySection(apiItem: ApiDocumentedItem): Paragraph | undefined {
        const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

        if (tsdocComment) {
            if (tsdocComment.deprecatedBlock) {
                if (true && this._documenterConfig && this._documenterConfig.logLevel === 'verbose') {
                    for (const node of tsdocComment.deprecatedBlock.content.nodes) {
                        console.log(`NODE: ${node.kind}, CHILDREN: [${node.getChildNodes().map(v => v.kind)}]`);
                    }
                }

                // for(const node of tsdocComment.deprecatedBlock.content.nodes) {
                //     node.kind === DocNodeKind.
                // }
                const output = callout("warning", "Deprecated", [
                    // TODO: finish this
                ]);
                return output as Paragraph;
            }

            // this._appendSection(output, tsdocComment.summarySection);
        }
    }

    protected getCodeExcerpt(apiItem: ApiDeclaredItem): Content[] {
        const nodes: Content[] = [];
        if (apiItem.excerpt.text.length > 0) {
            nodes.push(md.paragraph(md.strong([md.text("Signature:")])) as Paragraph);
            nodes.push(md.code("typescript", apiItem.getExcerptWithModifiers()) as Code)
        }
        nodes.push(...this.getTypeHeritage(apiItem));
        return nodes;
    }

    protected getTypeHeritage(apiItem: ApiDeclaredItem): Content[] {
        const nodes: Content[] = [];

        if (apiItem instanceof ApiClass) {
            if (apiItem.extendsType) {
                const extendsParagraph = md.paragraph(md.strong([md.text("Extends: "), ...this._appendExcerptWithHyperlinks(apiItem.extendsType.excerpt)])) as Paragraph;
                nodes.push(extendsParagraph);
            }
            if (apiItem.implementsTypes.length > 0) {
                const extendsParagraph = md.paragraph(md.strong([md.text("Implements: ")])) as Paragraph;

                let needsComma: boolean = false;
                for (const implementsType of apiItem.implementsTypes) {
                    if (needsComma) {
                        extendsParagraph.children.push(md.text(", ") as Text);
                    }
                    nodes.push(...this._appendExcerptWithHyperlinks(implementsType.excerpt));
                    needsComma = true;
                    nodes.push(extendsParagraph);
                }
            }
            if (apiItem.typeParameters.length > 0) {
                console.log(`HERITAGE GENERIC: ${JSON.stringify(apiItem.typeParameters.map(v => v.name))}`);
                const typeParamParagraph = md.paragraph(md.strong(md.text("Type parameters: "))) as Paragraph;
                nodes.push(typeParamParagraph);

                for (const typeParam of apiItem.typeParameters) {
                    const paragraph = md.paragraph([
                        md.strong(md.text(typeParam.name)),
                        md.text(` -- `)
                    ]) as Paragraph;
                    if (typeParam.tsdocTypeParamBlock) {
                        console.log(`Appending section for ${typeParam.name}`);

                        // TODO: figure out how to do this
                        // this._appendSection(typeParamParagraph, typeParam.tsdocTypeParamBlock.content.);
                    }

                    nodes.push(paragraph);
                }
            }
        }

        if (apiItem instanceof ApiInterface) {
            if (apiItem.extendsTypes.length > 0) {
                const extendsParagraph = md.paragraph(md.strong(md.text("Extends: "))) as Paragraph;

                let needsComma: boolean = false;
                for (const extendsType of apiItem.extendsTypes) {
                    if (needsComma) {
                        extendsParagraph.children.push(md.text(", ") as Text);
                    }
                    nodes.push(...this._appendExcerptWithHyperlinks(extendsType.excerpt));
                    needsComma = true;
                    nodes.push(extendsParagraph);
                }
            }
        }

        return nodes;
    }

    protected getRemarks(apiItem: ApiItem): Paragraph {
        const nodes: Content[] = [];
        if (apiItem instanceof ApiDocumentedItem) {
            const tsdocComment: DocComment | undefined = apiItem.tsdocComment;

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

    private _appendExcerptWithHyperlinks(excerpt: Excerpt): PhrasingContent[] {
        const nodes: PhrasingContent[] = [];

        for (const token of excerpt.spannedTokens) {
            // Markdown doesn't provide a standardized syntax for hyperlinks inside code spans, so we will render
            // the type expression as DocPlainText.  Instead of creating multiple DocParagraphs, we can simply
            // discard any newlines and let the renderer do normal word-wrapping.
            const unwrappedTokenText: string = token.text.replace(/[\r\n]+/g, ' ');

            // If it's hyperlinkable, then append a DocLinkTag
            if (token.kind === ExcerptTokenKind.Reference && token.canonicalReference) {
                const apiItemResult: IResolveDeclarationReferenceResult = this._apiModel.resolveDeclarationReference(
                    token.canonicalReference,
                    undefined
                );

                if (apiItemResult.resolvedApiItem) {
                    nodes.push(md.link(
                        this._getLinkFilenameForApiItem(apiItemResult.resolvedApiItem),
                        unwrappedTokenText,
                        [md.text(unwrappedTokenText)]
                    ) as Link);
                    continue;
                }
            }
        }
        return nodes;
    }

    protected getFrontMatter(item: ApiItem): void {

        this._frontmatter.kind = item.kind;
        this._frontmatter.title = item.displayName.replace(/"/g, '').replace(/!/g, '');
        let apiMembers: ReadonlyArray<ApiItem> = item.members;
        // const mdEmitter = this._markdownEmitter;

        const extractSummary = (docComment: DocComment): string => {
            // const tmpStrBuilder: StringBuilder = new StringBuilder();
            const summary = docNodeToMdast(docComment!.summarySection);
            if (summary) {
                return summary.toString();
            }
            return "";
        }
        switch (item.kind) {
            case ApiItemKind.Class:
                const classItem: ApiClass = item as ApiClass;
                if (classItem.tsdocComment) {
                    this._frontmatter.summary = extractSummary(classItem.tsdocComment);
                }
                this._frontmatter.title += " Class"
                break;
            case ApiItemKind.Interface:
                this._frontmatter.title += " Interface"
                const interfaceItem: ApiInterface = item as ApiInterface;
                if (interfaceItem.tsdocComment) {
                    this._frontmatter.summary = extractSummary(interfaceItem.tsdocComment);
                }
                break
            case ApiItemKind.Package:
                this._frontmatter.title += " Package"
                apiMembers =
                    item.kind === ApiItemKind.Package
                        ? (item as ApiPackage).entryPoints[0].members
                        : (item as ApiNamespace).members;
                const pkgItem: ApiPackage = item as ApiPackage;
                if (pkgItem.tsdocComment) {
                    this._frontmatter.summary = extractSummary(pkgItem.tsdocComment);
                }
                break
            default:
                break;
        }

        this._frontmatter.members = new Map<string, Map<string, string>>();
        apiMembers.forEach(element => {
            if (element.displayName === "") { return }
            if (!this._frontmatter.members.get(element.kind)) {
                this._frontmatter.members.set(element.kind, new Map<string, string>());
            }
            this._frontmatter.members.get(
                element.kind
            )?.set(
                element.displayName,
                this._getLinkFilenameForApiItem(element)
            );
        });

        const pkg: ApiPackage | undefined = item.getAssociatedPackage();
        if (pkg) {
            this._frontmatter.package = pkg.name.replace(/"/g, '').replace(/!/g, '');
            this._frontmatter.unscopedPackageName = PackageName.getUnscopedName(pkg.name);
        } else {
            this._frontmatter.package = "undefined";
        }
        // this._frontmatter.members = this._frontmatter.members;


        // stringBuilder.append(JSON.stringify(this._frontmatter));
        // stringBuilder.append(
        //     '\n\n[//]: # (Do not edit this file. It is automatically generated by API Documenter.)\n\n'
        // );

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

import { ApiItem, ApiItemKind, ApiModel, ApiPackage, ApiParameterListMixin } from "@microsoft/api-extractor-model";
import path from "path";
// import { fromMarkdown } from "mdast-util-from-markdown";
// import { MarkdownDocumenterAccessor } from "../plugin/MarkdownDocumenterAccessor";
// import { MarkdownDocumenterFeatureContext } from "../plugin/MarkdownDocumenterFeature";
// import { MarkdownDocumenter } from "@microsoft/api-documenter";
import type { Node, Parent } from "unist";
import type { Heading, Code, Link, Root } from "mdast";
import * as md from "mdast-builder";
import { toMarkdown } from "mdast-util-to-markdown";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { DocSection, TSDocConfiguration } from "@microsoft/tsdoc";
import { remark } from "remark";

import { FileSystem as fs, PackageName } from "@rushstack/node-core-library";
import { getSafeFilenameForName } from "./util";

export interface HugoDocumenterOptions {
    apiModel: ApiModel;
    inputPath: string;
    outputPath: string;
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
// ]);

// const processor = unified().use(remarkStringify, {
//   bullet: "-",
//   fence: "`",
//   fences: true,
//   incrementListMarker: false
// });

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

export class HugoDocumenter {
    private readonly _apiModel: ApiModel;
    private readonly _inputPath: string;
    private readonly _outputPath: string;

    public constructor(options: HugoDocumenterOptions) {
        this._apiModel = options.apiModel;
        this._inputPath = options.inputPath;
        this._outputPath = options.outputPath;
    }



    // private readonly ast: Root;
    // private readonly processor = unified().use(remarkStringify, {
    //     bullet: "-",
    //     fence: "`",
    //     fences: true,
    //     incrementListMarker: false,
    //     strong: "*"
    // });

    // private output = processor.stringify(
    //   md.root([
    //     md.heading(2, md.text("Begin")),
    //     md.paragraph([
    //       md.paragraph(md.text("these are the starting instructions")),
    //       md.brk,
    //       md.brk,
    //       md.list("unordered", [
    //         md.listItem(md.text("one")),
    //         md.listItem(md.text("two")),
    //         md.listItem(md.text("three"))
    //       ])
    //     ])
    //   ])
    // );

    private _loadApiFiles(inputPath: string, model?: ApiModel): ApiModel {
        const apiModel = model ?? new ApiModel();

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

        const ast = this.writeBreadcrumb(apiItem);

        const scopedName: string = apiItem.getScopedNameWithinPackage();

        console.log(toMarkdown(tree));

        // this.processor.stringify(
        //   md.root([
        //     md.heading(2, text("Begin")),
        //     md.paragraph([
        //       md.paragraph(text("these are the starting instructions")),
        //       md.brk,
        //       md.brk,
        //       md.list("unordered", [
        //         md.listItem(text("one")),
        //         md.listItem(text("two")),
        //         md.listItem(text("three"))
        //       ])
        //     ])
        //   ])
        // );
    }

    protected writeBreadcrumb(apiItem: ApiItem): Node {
        const output = md.root([
            md.paragraph([
                md.link(this._getLinkFilenameForApiItem(apiItem), "Home"),
                md.text(" > "),
            ])
        ]);

        for (const hierarchyItem of apiItem.getHierarchy()) {
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

}

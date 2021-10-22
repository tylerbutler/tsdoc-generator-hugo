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
import { callout, docNodesToMdast } from "./mdNodes.js";
import { getSafeFilenameForName, groupBy, groupByApiKind, isAllowedPackage } from "./util.js";
import { squeezeParagraphs } from "mdast-squeeze-paragraphs";

export async function getBreadcrumb(apiItem: ApiItem): Promise<Paragraph> {
    const output = md.paragraph([
        md.link(_getLinkFilenameForApiItem(apiItem), "Home", [md.text("Home")]),
        md.text(" > "),
    ]) as Paragraph;

    for (const hierarchyItem of apiItem.getHierarchy()) {
        // console.log(chalk.red(`hierarchyItem: ${hierarchyItem.kind} ${hierarchyItem}`));
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

export async function getSummary(apiItem: ApiItem, withHeading = false): Promise<Paragraph> {
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

export async function getDeprecatedCallout(item: ApiDocumentedItem): Promise<Paragraph> {
    if (item.tsdocComment?.deprecatedBlock) {
        // console.log(chalk.red(`${apiItem.displayName} is deprecated!`))
        const block = item.tsdocComment?.deprecatedBlock;
        return callout("warning", "Deprecated", docNodesToMdast(block.getChildNodes()));
    } else return md.paragraph() as Paragraph;
}


export async function getRemarks(apiItem: ApiItem): Promise<Paragraph> {
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

export async function getNotes(apiItem: ApiItem): Promise<Paragraph> {
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

export async function getSignature(item: ApiDeclaredItem): Promise<Paragraph> {
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

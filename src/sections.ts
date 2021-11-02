import {
    ApiClass,
    ApiConstructor,
    ApiDeclaredItem,
    ApiDocumentedItem, ApiInterface, ApiItem,
    ApiItemKind, ApiMethod, ApiMethodSignature, ApiModel, ApiParameterListMixin, ApiReturnTypeMixin, ApiTypeParameterListMixin, Excerpt, ExcerptTokenKind, Parameter, TypeParameter
} from "@microsoft/api-extractor-model";
import {
    DocBlock, DocComment, DocNode, DocParamBlock, StandardTags
} from "@microsoft/tsdoc";
import { Meaning } from "@microsoft/tsdoc/lib-commonjs/beta/DeclarationReference";
import chalk from "chalk";
import type { Code, Content, Heading, Link, Paragraph, PhrasingContent, Strong, Table, TableRow, Text } from "mdast";
import * as md from "mdast-builder";
import { Emphasis } from "mdast-util-from-markdown/lib";
import path from "path/posix";
import { ApiItemWrapper, ApiModelWrapper } from "./ApiModelWrapper.js";
import { DocumenterConfig } from "./DocumenterConfig.js";
import { callout, docNodesToMdast, docNodeToMdast, hasStandalonePage, hugoLabel, hugoLinkForItem, hugoPanel, linkIfFound, linkItem, spacer } from "./mdNodes.js";

export async function getBreadcrumb(item: ApiItem, model: ApiModel, config: DocumenterConfig): Promise<Paragraph> {
    const separator = () => md.text(" > ") as Text;

    if (hasStandalonePage(item)) {
    }
    const output = md.paragraph([
        md.link("/docs/apis/", "Packages", [md.text("Packages")]),
        separator(),
    ]) as Paragraph;

    const wrapper = new ApiModelWrapper(model);

    for (const hierarchyItem of item.getHierarchy()) {
        // console.log(chalk.red(`hierarchyItem: ${hierarchyItem.kind} ${hierarchyItem}`));
        switch (hierarchyItem.kind) {
            case ApiItemKind.Model:
            case ApiItemKind.EntryPoint:
                // We don't show the model as part of the breadcrumb because it is the root-level container.
                // We don't show the entry point because today API Extractor doesn"t support multiple entry points;
                // this may change in the future.
                break;
            case ApiItemKind.Package:
                console.log("Got a package");
            default:
                const link = linkItem(wrapper, hierarchyItem, config);
                output.children.push(link, separator());
        }
    }
    output.children.pop(); // remove the last item since it's a separator
    return output;
}

export async function getSummary(apiItem: ApiItem, extendedSummary = false, withHeading = false): Promise<Paragraph> {
    const nodes: Content[] = [];
    // let docComment: DocComment | DocParamBlock | undefined;
    let docNodes: readonly DocNode[] | undefined;

    if (apiItem instanceof ApiDeclaredItem) {
        // const tsdocComment = apiItem.tsdocComment;
        const docComment = apiItem.tsdocComment;
        if (docComment) {
            if (docComment.summarySection) {
                docNodes = extendedSummary ? docComment.summarySection.nodes : docComment.summarySection.nodes.slice(0, 1);
            } else {
                docNodes = [];
            }
        }
    }

    if (docNodes && docNodes.length > 0) {
        if (withHeading) {
            nodes.push(md.heading(4, md.text("Summary")) as Heading);
            nodes.push(spacer());
        }
        // console.log(chalk.greenBright(`Converting ${apiItem.displayName} to MDAST`));
        nodes.push(...docNodesToMdast(docNodes));
    }
    // console.log(`nodes for ${apiItem.displayName}: ${tsdocComment.summarySection.nodes.map(n => n.kind)}`);

    return md.paragraph(nodes) as Paragraph;
}

export async function getParameterSummary(item: Parameter, extendedSummary = false): Promise<Paragraph> {
    const nodes: Content[] = [];

    if (item.tsdocParamBlock) {
        const docComment = item.tsdocParamBlock.content;
        const mdNodes = docNodeToMdast(docComment);
        if (mdNodes) {
            const summaryNodes = extendedSummary ? mdNodes : mdNodes?.slice(0, 1);
            nodes.push(...summaryNodes);
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

export async function isDeprecated(item: ApiDocumentedItem): Promise<boolean> {
    return item.tsdocComment?.deprecatedBlock !== undefined;
}

export async function getRemarks(apiItem: ApiItem): Promise<Paragraph> {
    const nodes: Content[] = [];
    if (apiItem instanceof ApiDocumentedItem) {
        const tsdocComment = apiItem.tsdocComment;

        if (tsdocComment) {
            // Write the @remarks block
            if (tsdocComment.remarksBlock) {
                nodes.push(md.heading(3, md.text("Remarks")) as Heading)
                nodes.push(spacer());
                nodes.push(...docNodesToMdast(tsdocComment.remarksBlock.content.nodes));
            }

            // Write the @example blocks
            const exampleBlocks: DocBlock[] = tsdocComment.customBlocks.filter(
                (x) => x.blockTag.tagNameWithUpperCase === StandardTags.example.tagNameWithUpperCase
            );

            let exampleNumber: number = 1;
            for (const exampleBlock of exampleBlocks) {
                const heading: string = exampleBlocks.length > 1 ? `Example ${exampleNumber}` : 'Example';

                nodes.push(
                    md.heading(2, md.text(heading)) as Heading,
                    spacer(),
                );
                nodes.push(...docNodesToMdast(exampleBlock.content.nodes));

                ++exampleNumber;
            }
        }
    }
    return md.paragraph(nodes) as Paragraph;
}

export async function getReturn(apiItem: ApiDocumentedItem): Promise<Paragraph> {
    const nodes: Content[] = [];
    const tsdocComment = apiItem.tsdocComment;

    if (tsdocComment) {
        // Write the @returns block
        if (tsdocComment.returnsBlock) {
            nodes.push(md.paragraph([
                spacer(),
                md.strong(md.text("Returns:")),
                md.text(" "),
                ...docNodesToMdast(tsdocComment.returnsBlock.content.nodes),
                spacer(),
            ]) as Paragraph);
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
                nodes.push(hugoLabel("Deprecated", "default"));
                nodes.push(md.text(" ") as Text);
                nodes.push(...docNodesToMdast(tsdocComment.deprecatedBlock.getChildNodes()));
            }
        }
    }
    return md.paragraph(nodes) as Paragraph;
}

export async function getSignature(item: ApiDeclaredItem, withHeading: boolean = false): Promise<Paragraph> {
    const nodes: Content[] = [];

    if (withHeading) {
        nodes.push(md.strong(md.text("Signature:")) as Strong);
        nodes.push(spacer());
    }

    nodes.push(md.code("typescript", item.getExcerptWithModifiers()) as Code);
    nodes.push(spacer());
    return md.paragraph(nodes) as Paragraph;
}

export async function getExtends(apiItem: ApiClass | ApiInterface, model: ApiModel, config: DocumenterConfig): Promise<Paragraph> {
    const nodes: Content[] = [];

    if (apiItem instanceof ApiClass) {
        if (apiItem.extendsType) {
            const excerpt = await _getExcerptWithHyperlinks(apiItem.extendsType.excerpt, model, config)
            // console.log(chalk.red(excerpt[excerpt.length - 1].type));
            nodes.push(md.paragraph([
                md.strong(md.text("Extends:")),
                md.text(" "),
                ...excerpt,
                spacer(),
            ]) as Paragraph);
        }

        if (apiItem.implementsTypes.length > 0) {
            const implementsParagraph = md.paragraph([
                md.strong(md.text("Implements:")),
                md.text(" "),
            ]) as Paragraph;

            let needsComma: boolean = false;
            for (const implementsType of apiItem.implementsTypes) {
                const excerpt = await _getExcerptWithHyperlinks(implementsType.excerpt, model, config);
                if (needsComma) {
                    implementsParagraph.children.push(md.text(', ') as Text);
                }
                implementsParagraph.children.push(...excerpt);
                needsComma = true;
            }
            nodes.push(spacer(), implementsParagraph);
        }
    }

    if (apiItem.typeParameters.length > 0) {
        console.log(`HERITAGE GENERIC: ${JSON.stringify(apiItem.typeParameters.map(v => v.name))}`);
        const typeParamsParagraph = md.paragraph([
            md.strong(md.text("Type parameters:")),
            md.text(" \n\n"),
        ]) as Paragraph;

        for (const typeParam of apiItem.typeParameters) {
            const typeParamParagraph = md.paragraph([
                md.strong(md.text(typeParam.name)),
                md.text(" -- "),
            ]) as Paragraph;

            if (typeParam.tsdocTypeParamBlock) {
                console.log(`Appending section for ${typeParam.name}`);
                const mdast = docNodeToMdast(typeParam.tsdocTypeParamBlock.content, model);
                console.log(`${mdast?.length} mdast nodes.`);
                console.log(JSON.stringify(mdast));

                if (mdast) {
                    typeParamParagraph.children.push(...(mdast as PhrasingContent[]))
                }
            } else {
                typeParamParagraph.children.push(md.emphasis(md.text("No documentation.")) as Emphasis);
            }

            typeParamsParagraph.children.push(...typeParamParagraph.children);
        }
        nodes.push(typeParamsParagraph);
    }
    return md.paragraph(nodes) as Paragraph;
}

export async function getFunctionParameters(item: ApiParameterListMixin, model: ApiModel, config: DocumenterConfig): Promise<Paragraph | undefined> {
    if (item.parameters.length === 0) {
        return undefined;
    }

    const wrapper = new ApiModelWrapper(model);
    const nodes: Content[] = [];
    const table = md.table([null], []) as Table;
    let description: Content | undefined;

    // Headers are in the first row of table
    table.children.push(md.tableRow([
        md.tableCell([md.text("Parameter")]),
        md.tableCell([md.text("Type")]),
        md.tableCell([md.text("Description")]),
        md.tableCell([md.text("Notes")])
    ]) as TableRow);

    for (const p of item.parameters) {
        // const [summary, notes] = await Promise.all([getSummary(p), getNotes(p)]);
        const summary = await getParameterSummary(p);
        const paramType = p.parameterTypeExcerpt.text;
        if (wrapper) {
            description = linkIfFound(wrapper, paramType, config);
        } else {
            description = md.text(paramType) as Text;
            // console.log(chalk.redBright())
        }
        // const found = wrapper?.find(paramType, undefined, false);
        // if (found) {
        //     description = hugoLinkForItem(paramType);
        // } else {
        //     description = md.text(paramType) as Text;
        //     // console.log(chalk.redBright())
        // }

        table.children.push(md.tableRow([
            md.tableCell([md.text(p.name)]),
            md.tableCell([description]),
            md.tableCell([summary]),
            md.tableCell([]),
        ]) as TableRow);
    }
    const classDecoration = md.text(`\n{.table .${item.kind.toLowerCase()}-table}\n`) as Text;
    nodes.push(table, classDecoration, spacer());

    return md.paragraph(nodes) as Paragraph;
}

export async function getExcerptCodeBlock(excerpt: Excerpt, model: ApiModel): Promise<Code> {
    return md.code("typescript", excerpt.text) as Code;
}

export async function _getExcerptWithHyperlinks(excerpt: Excerpt, model: ApiModel, config: DocumenterConfig): Promise<PhrasingContent[]> {
    const nodes: PhrasingContent[] = [];
    const wrapper = model ? new ApiModelWrapper(model) : undefined;

    for (const token of excerpt.spannedTokens) {
        const unwrappedTokenText: string = token.text;//.replace(/[\r\n]+/g, ' ');
        console.log(chalk.yellowBright(unwrappedTokenText));

        // If it's hyperlinkable, then append a link
        if (token.kind === ExcerptTokenKind.Reference) {
            const symbol = token.canonicalReference?.symbol;
            const meaning = symbol?.meaning;
            const name = symbol?.componentPath?.toString();

            console.log(chalk.cyan(`  ${name} -- ${meaning}`));

            if (name && wrapper && (meaning === Meaning.Class || meaning === Meaning.Interface)) {
                const link = linkIfFound(wrapper, name, config);
                nodes.push(link);
            }
        } else {
            nodes.push(md.text(unwrappedTokenText) as Text);
        }
    }
    return nodes;
}

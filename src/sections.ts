import {
    ApiClass,
    ApiDeclaredItem,
    ApiDocumentedItem, ApiIndexSignature, ApiInterface, ApiItem,
    ApiItemKind, ApiModel, ApiParameterListMixin, Excerpt, ExcerptTokenKind, IResolveDeclarationReferenceResult, TypeParameter
} from "@microsoft/api-extractor-model";
import {
    DocBlock, StandardTags
} from "@microsoft/tsdoc";
import { PackageName } from "@rushstack/node-core-library";
import type { Code, Content, Heading, Link, Paragraph, PhrasingContent, Strong, Text } from "mdast";
import * as md from "mdast-builder";
import { callout, docNodesToMdast, docNodeToMdast } from "./mdNodes.js";
import { getSafeFilenameForName } from "./util.js";

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
    // nodes.push(md.text("\n\n") as Text);
    return md.paragraph(nodes) as Paragraph;
}

export async function getExtends(apiItem: ApiClass | ApiInterface): Promise<Paragraph> {
    const nodes: Content[] = [];

    if (apiItem instanceof ApiClass && apiItem.extendsType) {
        const excerpt = await _getExcerptWithHyperlinks(apiItem.extendsType.excerpt)
        nodes.push(md.paragraph([
            md.strong(md.text("Extends:")),
            md.text(" "),
            ...excerpt,
            md.text("\n\n")]) as Paragraph);
    }

    if (apiItem instanceof ApiClass && apiItem.implementsTypes.length > 0) {
        const implementsParagraph = md.paragraph([
            md.strong(md.text("Implements:")),
            md.text(" "),
        ]) as Paragraph;

        let needsComma: boolean = false;
        for (const implementsType of apiItem.implementsTypes) {
            const excerpt = await _getExcerptWithHyperlinks(implementsType.excerpt);
            if (needsComma) {
                implementsParagraph.children.push(md.text(', ') as Text);
            }
            implementsParagraph.children.push(...excerpt);
            needsComma = true;
        }
        nodes.push(md.text("\n\n") as Text, implementsParagraph);
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
                const mdast = docNodeToMdast(typeParam.tsdocTypeParamBlock.content);

                if (mdast) {
                    typeParamParagraph.children.push(...(mdast as PhrasingContent[]))
                }
            }

            typeParamsParagraph.children.push(...typeParamParagraph.children);
        }
        nodes.push(typeParamsParagraph);
    }
    return md.paragraph(nodes) as Paragraph;
}

export async function getTypeParams(params: readonly TypeParameter[], excerpt?: Excerpt): Promise<void> {
}


export async function _getExcerptWithHyperlinks(excerpt: Excerpt, model?: ApiModel): Promise<PhrasingContent[]> {
    const nodes: PhrasingContent[] = [];

    for (const token of excerpt.spannedTokens) {
        // Markdown doesn't provide a standardized syntax for hyperlinks inside code spans, so we will render
        // the type expression as DocPlainText.  Instead of creating multiple DocParagraphs, we can simply
        // discard any newlines and let the renderer do normal word-wrapping.
        const unwrappedTokenText: string = token.text.replace(/[\r\n]+/g, ' ');

        // If it's hyperlinkable, then append a DocLinkTag
        if (token.kind === ExcerptTokenKind.Reference && token.canonicalReference && model) {
            const apiItemResult: IResolveDeclarationReferenceResult = model.resolveDeclarationReference(
                token.canonicalReference,
                undefined
            );

            if (apiItemResult.resolvedApiItem) {
                nodes.push(md.link(_getLinkFilenameForApiItem(apiItemResult.resolvedApiItem), unwrappedTokenText, [
                    md.text(unwrappedTokenText)
                ]) as Link);
                // docNodeContainer.appendNode(
                //     new DocLinkTag({
                //         configuration,
                //         tagName: '@link',
                //         linkText: unwrappedTokenText,
                //         urlDestination: _getLinkFilenameForApiItem(apiItemResult.resolvedApiItem)
                //     })
                // );
                continue;
            }
        } else {
            nodes.push(md.text(unwrappedTokenText) as Text);
        }
    }
    return nodes;
}


function _getFilenameForApiItem(apiItem: ApiItem): string {
    if (apiItem.kind === ApiItemKind.Model) {
        return "index.md";
    }

    let baseName = "";
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


import { ApiItem, ApiItemKind, ApiModel, ApiParameterListMixin, IResolveDeclarationReferenceResult } from "@microsoft/api-extractor-model";
import {
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
    DocSection
} from "@microsoft/tsdoc";
import { PackageName } from "@rushstack/node-core-library";
import chalk from "chalk";
import type { Break, Code, Content, HTML, InlineCode, Link, Paragraph, Text } from "mdast";
import * as md from "mdast-builder";
import { fromMarkdown } from "mdast-util-from-markdown";
import path from "path";
import { describe } from "yargs";
import { ApiItemWrapper } from "./ApiModelWrapper.js";
import { getSafeFilenameForName } from "./util.js";

export function callout(type: string, title?: string, children?: Content[]): Paragraph {
    const opener = [
        md.text(`{{% callout "${type}"`)
    ];
    if (title) {
        opener.push(md.text(` ${title} `));
    }
    opener.push(md.text(` %}}`));
    opener.push(spacer());

    const content = [...opener];
    if (children) {
        content.push(...children);
    }

    content.push(spacer());
    content.push(md.text(`{{% /callout %}}`));
    content.push(spacer());

    const output = md.paragraph(content) as Paragraph;
    return output;
}

export const spacer = () => md.text("\n\n") as Text;

export function hugoLinkForItem(item: string, linkText?: string): Link {
    if (!linkText) { linkText = item; }
    return hugoLink(linkText, `${item.toLowerCase()}.md`);
}

export function hugoLink(linkText: string, apiRef: string, title?: string): Link {
    const link = md.link(apiRef, title, md.text(linkText)) as Link;
    return link;
}

export function docNodesToMdast(nodes: readonly DocNode[], model?: ApiModel): Content[] {
    const res = nodes
        // .filter(n=>docNodeToMdast(n) !== undefined)
        .flatMap((n) => {
            const mdast = docNodeToMdast(n, model);
            if (mdast !== undefined) {
                return mdast;
            }
            else return [] as Content[];
        });
    return res;
}

export function docNodeToMdast(docNode: DocNode, model?: ApiModel): Content[] | undefined {
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
                console.log(chalk.red(docLinkTag.linkText, docLinkTag.tagName, docLinkTag.codeDestination.getChildNodes()));
                const link = linkTagWithCodeDestination(docLinkTag, model)
                return [link];
                // throw new Error("writeLinkTagWithCodeDestination()");
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

export function linkIfFound(wrapper: ApiItemWrapper | undefined, searchString: string, kind?: ApiItemKind): Link | Text {
    if (!wrapper) { return md.text(searchString) as Text; }
    const found = wrapper.find(searchString, kind, false);
    if (found) {
        return hugoLinkForItem(searchString);
    } else {
        return md.text(searchString) as Text;
        // console.log(chalk.redBright())
    }
}

export function linkItem(wrapper: ApiItemWrapper | undefined, item: ApiItem, kind?: ApiItemKind): Link | Text {
    const link = _getLinkFilenameForApiItem(item);
    if (hasStandalonePage(item)) {
        if (!wrapper) { return md.text(item.displayName) as Text; }

        return hugoLink(item.displayName, link);
    } else {
        return hugoLink(item.displayName, "#" + item.displayName.toLowerCase());
    }
}

function plainTextToMdast(docNode: DocPlainText): Content[] {
    // const content:Content[] = [];
    const docPlainText = docNode as DocPlainText;
    // console.log(chalk.bgBlue(docPlainText.text));
    const toReturn = fromMarkdown(docPlainText.text);
    return toReturn.children;
}

function linkTagWithCodeDestination(
    docLinkTag: DocLinkTag,
    // context: IMarkdownEmitterContext<ICustomMarkdownEmitterOptions>,
    model?: ApiModel
): Link | Text {
    const ref: IResolveDeclarationReferenceResult | undefined = model?.resolveDeclarationReference(
        docLinkTag.codeDestination!,
        // options.contextApiItem,
        undefined,
    );

    if (ref && ref.resolvedApiItem) {
        // if(hasStandalonePage(ref.resolvedApiItem))
        const filename: string | undefined = _getFilenameForApiItem(ref.resolvedApiItem);
        let linkText: string = docLinkTag.linkText || "";

        if (linkText.length === 0) {
            // Generate a name such as Namespace1.Namespace2.MyClass.myMethod()
            linkText = ref.resolvedApiItem.getScopedNameWithinPackage();
        }

        if (linkText.length > 0) {
            // const encodedLinkText: string = linkText.replace(/\s+/g, ' ');
            return hugoLink(linkText, `${filename ? filename + '.md' : ''}#${ref.resolvedApiItem.displayName.toLowerCase()}`);
        } else {
            console.log(chalk.yellow("WARNING: Unable to determine link text"));
        }
    } else if (ref?.errorMessage) {
        console.log(
            chalk.yellow(
                `WARNING: Unable to resolve reference "${docLinkTag.codeDestination!.emitAsTsdoc()}": ` +
                ref.errorMessage
            )
        );
    }
    return md.text("") as Text;
}

export function _getFilenameForApiItem(item: ApiItem): string | undefined {
    if (!hasStandalonePage(item)) {
        // throw new Error(`Can't process item of kind: ${item.kind}`);
        return undefined;
    }

    // if (item.kind === ApiItemKind.Model) {
    //     return "index.md";
    // }

    let baseName = "";

    // if (item.displayName === "AzureAudience") {
    //     console.log(chalk.white(`baseName: ${baseName}, kind: ${""}`));
    // }

    for (const hierarchyItem of item.getHierarchy()) {
        // For overloaded methods, add a suffix such as "MyClass.myMethod_2".
        // let qualifiedName: string = getSafeFilenameForName(hierarchyItem.displayName);
        // if (ApiParameterListMixin.isBaseClassOf(hierarchyItem)) {
        //     if (hierarchyItem.overloadIndex > 1) {
        //         // Subtract one for compatibility with earlier releases of API Documenter.
        //         // (This will get revamped when we fix GitHub issue #1308)
        //         qualifiedName += `_${hierarchyItem.overloadIndex - 1}`;
        //     }
        // }

        switch (hierarchyItem.kind) {
            case ApiItemKind.Class:
            case ApiItemKind.Interface:
                // console.log(`class/interface: ${hierarchyItem.displayName}`);
                baseName += "/" + hierarchyItem.displayName.toLowerCase();
                break;
            case ApiItemKind.Package:
                baseName += "/" + PackageName.getUnscopedName(hierarchyItem.displayName);
                break;
            case ApiItemKind.EntryPoint:
            default:
                // baseName += "/" + baseName;
                break;
        }

        // if (item.displayName === "AzureAudience") {
        //     console.log(chalk.white(`baseName: ${baseName}, kind: ${hierarchyItem.kind}`));
        // }
    }
    // if (item.displayName === "AzureAudience") {
    //     console.log(chalk.white(`filename for ${item.displayName}: ${baseName}.md`))
    // }
    return baseName + '.md';
}

export function _getLinkFilenameForApiItem(apiItem: ApiItem): string {
    // return './' + _getFilenameForApiItem(apiItem);
    const filename = _getFilenameForApiItem(apiItem) ?? "index.md";
    return "/docs/apis" + filename;
}

export function hasStandalonePage(item: ApiItem) {
    const isPage = [ApiItemKind.Class, ApiItemKind.Interface, ApiItemKind.Package].includes(item.kind);
    return isPage;
}

export function hasType(item: ApiItem) {
    const hasType = [ApiItemKind.Property, ApiItemKind.Variable].includes(item.kind);
    return hasType;
}
